const DESTINATION = "PersistIQ";
const BASE_URL = "https://api.persistiq.com/v1";
const traitsToDelete = [
  "originalTimestamp",
  "timestamp",
  "sentAt",
  "createdAt",
  "creator_id",
  "firstName",
  "firstname",
  "lastName",
  "lastname",
  "dup"
];
const configCategories = {
  Create: {
    endpoint: `${BASE_URL}/leads`,
    method: "POST"
  },
  Update: {
    endpoint: `${BASE_URL}/leads/leadId`,
    method: "PATCH"
  },
  Group: {
    add: {
      endpoint: `${BASE_URL}/campaigns/:campaign_id/leads`,
      method: "POST"
    },
    remove: {
      endpoint: `${BASE_URL}/campaigns/:campaign_id/leads:lead_id`,
      method: "DELETE"
    }
  }
};
module.exports = { DESTINATION, traitsToDelete, configCategories };
