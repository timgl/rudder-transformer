const BASE_ENDPOINT = "https://api.helpscout.net";

const VERSION = "v2";

const { getMappingConfig } = require("../../util");

const CONFIG_CATEGORIES = {
  CREATE_USER: {
    name: "identifyConfig",
    type: "identify",
    endpoint: `${BASE_ENDPOINT}/${VERSION}/customers`
  },
  UPDATE_USER: {
    name: "identifyConfig",
    type: "identify",
    endpoint: `${BASE_ENDPOINT}/${VERSION}/customers/<customerId>`
  }
};

const acceptedEmailTypes = ["home", "other", "work"];

const acceptedPhoneTypes = ["fax", "home", "mobile", "other", "pager", "work"];

const acceptedChatTypes = [
  "aim",
  "gtalk",
  "icq",
  "msn",
  "other",
  "qq",
  "skype",
  "xmpp",
  "yahoo"
];

const acceptedSocialProfileTypes = [
  "aboutme",
  "facebook",
  "flickr",
  "forsquare",
  "google",
  "googleplus",
  "linkedin",
  "other",
  "quora",
  "tungleme",
  "twitter",
  "youtube"
];

const addOperations = [
  "emails",
  "phones",
  "chats",
  "socialProfiles",
  "websites"
];

const replaceOperations = [
  "firstName",
  "lastName",
  "address",
  "age",
  "jobTitle",
  "photoUrl",
  "background",
  "location",
  "gender",
  "photoType",
  "organization"
];

const excludeKeys = ["customerId", "properties"];

const keysWithTypes = [
  "emails",
  "phones",
  "chats",
  "socialProfiles",
  "websites"
];

const operation = {
  REPLACE: "replace",
  ADD: "add",
  REMOVE: "remove"
};

const paths = {
  firstName: "/firstName",
  lastName: "/lastName",
  phones: "/phones",
  chats: "/chats",
  socialProfiles: "/social-profiles",
  websites: "/websites",
  gender: "/gender",
  photoType: "/photoType",
  age: "/age",
  jobTitle: "/jobTitle",
  photoUrl: "/photoUrl",
  background: "/background",
  location: "/location",
  emails: "/emails",
  city: "/address/city",
  country: "/address/country",
  lines: "/address/lines",
  postalCode: "/address/postalCode",
  state: "/address/state",
  organization: "/organization"
};

const defaultTypes = {
  emailType: "work",
  phoneType: "mobile",
  chatType: "aim",
  socialProfileType: "aboutme"
};

const keysMappingWithTypes = {
  emails: "emailType",
  phones: "phoneType",
  chatType: "chatType",
  socialProfileType: "socialProfileType"
};

const keysMappingWithDefaultTypes = {
  emails: defaultTypes.emailType,
  phones: defaultTypes.phoneType,
  chats: defaultTypes.chatType,
  socialProfiles: defaultTypes.socialProfileType
};

const MAPPING_CONFIG = getMappingConfig(CONFIG_CATEGORIES, __dirname);

module.exports = {
  BASE_ENDPOINT,
  VERSION,
  CONFIG_CATEGORIES,
  MAPPING_CONFIG,
  acceptedEmailTypes,
  acceptedPhoneTypes,
  acceptedChatTypes,
  acceptedSocialProfileTypes,
  operation,
  paths,
  excludeKeys,
  keysWithTypes,
  defaultTypes,
  keysMappingWithDefaultTypes,
  keysMappingWithTypes,
  addOperations,
  replaceOperations
};
