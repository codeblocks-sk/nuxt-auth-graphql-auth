import { ExpiredAuthSessionError, RefreshScheme } from '~auth/runtime'
import { getProp, deepMerge } from './utils'

// TODO - add support for custom queries and mutations
import LoginMutation from '~/apollo/Mutations/Login.graphql'
import UserQuery from '~/apollo/Queries/User.graphql'
import RefreshTokenMutation from '~/apollo/Mutations/RefreshToken.graphql'

const DEFAULTS = {
  name: 'graphql',
  token: {
    loginProperty: 'data.login.token',
    refreshProperty: 'data.refresh.token',
    global: false
  },
  refreshToken: {
    loginProperty: 'data.login.refreshToken',
    refreshProperty: 'data.refresh.refreshToken',
    data: 'refreshToken'
  },
  user: {
    property: 'data.user'
  }
}

export default class GraphQLScheme extends RefreshScheme {
  constructor ($auth, options) {
    super($auth, deepMerge(DEFAULTS, options))
  }

  async mounted () {
    const { tokenExpired, refreshTokenExpired } = this.check(true)

    if (refreshTokenExpired) {
      this.$auth.reset()
    } else if (tokenExpired) {
      if (this.options.autoLogout) {
        this.$auth.reset()
      } else {
        await this.$auth.refreshTokens()
      }
    }

    return this.$auth.fetchUserOnce()
  }

  async login (credentials, { reset = true } = {}) {
    if (reset) {
      this.$auth.reset()
    }

    const apolloClient = this.$auth.ctx.app.apolloProvider.clients.defaultClient
    const response = await apolloClient.mutate({
      mutation: LoginMutation,
      variables: {
        input: credentials
      }
    })
      .catch(() => {})

    this.updateTokens(response)

    if (this.options.user.autoFetch) {
      await this.fetchUser()
    }

    const token = getProp(response, this.options.token.loginProperty)

    if (token) {
      await this.$auth.ctx.$apolloHelpers.onLogin('Bearer ' + token)
    }

    return response
  }

  logout () {
    this.$auth.ctx.$apolloHelpers.onLogout()
    this.$auth.reset()

    return Promise.resolve()
  }

  reset () {
    this.$auth.setUser(false)
    this.token.reset()
    this.refreshToken.reset()
  }

  fetchUser () {
    if (!this.check().valid) {
      return Promise.resolve()
    }

    const apolloClient = this.$auth.ctx.app.apolloProvider.clients.defaultClient
    return apolloClient
      .query({
        query: UserQuery,
        fetchPolicy: 'no-cache'
      })
      .then((response) => {
        const userData = getProp(response, this.options.user.property)

        if (!userData) {
          const error = new Error(`User Data response does not contain field ${this.options.user.property}`)
          return Promise.reject(error)
        }

        this.$auth.setUser({ ...userData })

        return response
      })
      .catch((error) => {
        this.$auth.callOnError(error, { method: 'fetchUser' })
        return Promise.reject(error)
      })
  }

  refreshTokens () {
    if (!this.check().valid) {
      return Promise.resolve()
    }

    const refreshTokenStatus = this.refreshToken.status()
    if (refreshTokenStatus.expired()) {
      this.$auth.reset()
      throw new ExpiredAuthSessionError()
    }

    const input = {}

    if (this.options.refreshToken.required && this.options.refreshToken.data) {
      input[this.options.refreshToken.data] = this.refreshToken.get()
    }

    const apolloClient = this.$auth.ctx.app.apolloProvider.clients.defaultClient

    this.refreshRequest = this.refreshRequest || apolloClient.mutate({
      mutation: RefreshTokenMutation,
      variables: { input },
      context: {
        headers: {
          authorization: null
        }
      }
    })
    return this.refreshRequest.then((response) => {
      this.updateTokens(response, { isRefreshing: true })
      return response
    }).catch((error) => {
      this.$auth.callOnError(error, { method: 'refreshToken' })
      return Promise.reject(error)
    }).finally(() => {
      this.refreshRequest = null
    })
  }

  updateTokens (response, { isRefreshing = false, updateOnRefresh = true } = {}) {
    const token = this.options.token.required ? getProp(response, this.options.token[isRefreshing ? 'refreshProperty' : 'loginProperty']) : true
    const refreshToken = this.options.refreshToken.required ? getProp(response, this.options.refreshToken[isRefreshing ? 'refreshProperty' : 'loginProperty']) : true

    this.token.set(token)
    if (refreshToken && (!isRefreshing || (isRefreshing && updateOnRefresh))) {
      this.refreshToken.set(refreshToken)
    }
  }
}
