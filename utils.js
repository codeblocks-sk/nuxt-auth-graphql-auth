export const getProp = (holder, propName) => {
  if (!propName || !holder || typeof holder !== 'object') {
    return holder
  }
  if (propName in holder) {
    return holder[propName]
  }
  const propParts = Array.isArray(propName) ? propName : (propName + '').split('.')
  let result = holder
  while (propParts.length && result) {
    result = result[propParts.shift()]
  }
  return result
}

export const deepMerge = (target, source) => {
  for (const key in source) {
    if (key in target) {
      if (typeof target[key] === 'object' && typeof source[key] === 'object') {
        deepMerge(target[key], source[key])
      } else {
        target[key] = source[key]
      }
    } else {
      target[key] = source[key]
    }
  }

  return target
}
