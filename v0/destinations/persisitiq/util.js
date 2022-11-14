const { set } = require("lodash");
const { traitsToDelete } = require("./config");

/**
 * Deletes the extra elements from payload
 * @param {*} payload
 * @returns message payload withoout redundancy
 */
const refinePayload = payload => {
  const refinedPayload = {};
  Object.keys(payload).forEach(v => {
    if (!traitsToDelete.includes(v)) {
      set(refinedPayload, `${v}`, payload[v]);
    }
  });
  return refinedPayload;
};
module.exports = { refinePayload };
