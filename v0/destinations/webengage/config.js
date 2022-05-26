const { getMappingConfig } = require("../../util");

const BASE_URL = "https://api.webengage.com/v1/accounts";
const BASE_URL_IND = "https://api.in.webengage.com/v1/accounts";

const WEBENGAGE_IDENTIFY_EXCLUSION = [
  "email",
  "phone",
  "phoneNumber",
  "phone_number",
  "firstName",
  "firstname",
  "lastname",
  "lastName",
  "name",
  "userId",
  "anonymousId",
  "birthDate",
  "gender",
  "emailOptIn",
  "smsOptIn",
  "whatsappOptIn",
  "company",
  "hashedEmail",
  "hashedPhone",
  "postalCode"
];

const CONFIG_CATEGORIES = {
  IDENTIFY: {
    name: "WEBENGAGEIdentifyConfig",
    type: "identify"
  },
  EVENT: {
    name: "WEBENGAGETrackConfig",
    type: "track"
  }
};

const MAPPING_CONFIG = getMappingConfig(CONFIG_CATEGORIES, __dirname);
module.exports = {
  CONFIG_CATEGORIES,
  MAPPING_CONFIG,
  WEBENGAGE_IDENTIFY_EXCLUSION,
  BASE_URL,
  BASE_URL_IND
};
