const pick = (obj, keys) => {
  const finalObj = {};

  for (const key of keys) {
    if (obj && Object.hasOwnProperty.call(obj, key)) {
      // Convert specific query parameters to numbers if needed
      if (key === 'page' || key === 'limit') {
        finalObj[key] = Number(obj[key]);
      } else {
        finalObj[key] = obj[key];
      }
    }
  }
  return finalObj;
};

export default pick;
