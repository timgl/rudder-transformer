const { CustomError } = require("../../util");
const { BASE_URL } = require("./config");
const { httpGET } = require("../../../adapters/network");
const {
  processAxiosResponse
} = require("../../../adapters/utils/networkUtils");
const _ = require("lodash");
const { getFieldValueFromMessage } = require("../../util");
const { set, values } = require("lodash");

// Includes the fields that can be lookUpfields
const FIELDS = [
  "",
  "title",
  "firstName",
  "lastName",
  "role",
  "email",
  "phone",
  "city",
  "state",
  "zipcode",
  "country"
];
//All the titles that are allowed
const ALLOWED_TITLES = ["Mr", "Mrs", "Miss", "Mr.", "Mrs.", "Miss."];

//check if input is a date or not
const isDate = date => {
  return new Date(date) !== "Invalid Date" && !isNaN(new Date(date));
};

//Includes valid values for prospectOrCustomer
const ALLOWED_POC = ["Prospect", "Customer"];

//Includes valid Values for subscriptionStatus
const ALLOWED_SUBSCRIPTION_STATUS = ["New", "Existing"];

//Includes valid Values for role
const ALLOWED_ROLE_VALUES = [
  "Individual Contributor",
  "Manager",
  "Director",
  "Executive",
  "Consultant"
];

// to get the Mautic field for the given Rudder Field for Filter axios call
const fieldMap={"title":"title",
"firstName":"firstname",
"lastName":"lastname",
"role":"role",
"phone":"phone",
"city":"city",
"state":"state",
"zipcode":"zipcode",
"country":"country"}

//creates the axios url using the subDomainName for basic url
// and propertyName and Value for filters
function createAxiosUrl(subDomainName, propertyName, value) {
  return `${BASE_URL.replace(
    "subDomainName",
    subDomainName
  )}/contacts?where%5B0%5D%5Bcol%5D=${propertyName}&where%5B0%5D%5Bexpr%5D=eq&where%5B0%5D%5Bval%5D=${value}`;
}
// for validating email match function outdated
function validateEmail(inputText) {
  // return true;
  const mailformat = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,3}$/;
  return mailformat.test(inputText);
}
// for validating Phone match function outdated
function validatePhone(inputText) {
  const phoneno = /^\d{10}$/;
  return phoneno.test(inputText);
}

//Refines the payload by validating and adding some payload Fields
const refinePayloadFields = (payload, message) => {
  const { traits, context } = message;
  if (
    (traits && traits?.hasPurchased) ||
    (context.traits && context.traits?.hasPurchased)
  ) {
    let purchased_status = traits?.hasPurchased || context.traits?.hasPurchased;
    purchased_status = purchased_status.toLowerCase();
    if (purchased_status === "yes" || purchased_status === "no") {
      set(payload, "haspurchased", purchased_status);
    } else {
      throw new CustomError("Invalid Purchase Status.", 400);
    }
  }
  if ((traits && traits?.role) || (context && context.traits?.role)) {
    const Role =
      traits && traits?.role
        ? message.traits?.role
        : message.context.traits?.role;
    if (!ALLOWED_ROLE_VALUES.includes(Role)) {
      throw new CustomError("This Role is not supported.", 400);
    }
    set(payload, "role", Role);
  }
  if (
    (traits && traits?.subscriptionStatus) ||
    (context.traits && context.traits?.subscriptionStatus)
  ) {
    const status =
      traits && traits?.subscriptionStatus
        ? message.traits?.subscriptionStatus
        : message.context.traits?.subscriptionStatus;
    if (!ALLOWED_SUBSCRIPTION_STATUS.includes(status)) {
      throw new CustomError("Invalid subscriptionStatus Value.", 400);
    }
    set(payload, "subscription_status", status);
  }
  if (
    (traits && traits?.prospectOrCustomer) ||
    context.traits?.prospectOrCustomer
  ) {
    const POC =
      message.traits?.prospectOrCustomer ||
      message.context.traits?.prospectOrCustomer;
    if (!ALLOWED_POC.includes(POC)) {
      throw new CustomError(
        "prospectOrCustomer can only be either prospect or customer or null.",
        400
      );
    }
    set(payload, "prospect_or_customer", POC);
  }
  return payload;
};

//Constructs the address1 and address2 field
//if address is given as string or object
const deduceAddressFields = message => {
  const { traits, context } = message;
  let address1;
  let address2;
  if (
    (traits !== undefined && traits?.address) ||
    (context.traits && context.traits?.address)
  ) {
    let add =
      traits && traits?.address
        ? message.traits.address
        : message.context.traits.address;
    if (typeof add === "object") {
      add = Object.keys(add).reduce(function(res, v) {
        return res.concat(add[v], " ");
      }, "");
    }
    const validLengthAddress = add.length > 128 ? add.substring(0, 127) : add;
    address1 = validLengthAddress.substring(0, 63);
    address2 = validLengthAddress.substring(64, validLengthAddress.length);
  }
  return { address1, address2 };
};

//Validates the generated payload fro specific fields
const validatePayload = payload => {
  // checking for message details validations
  if (payload.email && !validateEmail(payload.email)) {
    throw new CustomError("Invalid Mail Provided.", 400);
  }
  if (payload.phone && !validatePhone(payload.phone)) {
    throw new CustomError("Invalid Phone No. Provided.", 400);
  }
  if (payload.title && !ALLOWED_TITLES.includes(payload.title)) {
    throw new CustomError("Invalid title provided.", 400);
  }
  if (payload.last_active && !isDate(payload.last_active)) {
    throw new CustomError("Date is Invalid.", 400);
  }
  if (payload.state && !(payload.state[0] === payload.state[0].toUpperCase())) {
    throw new CustomError("State is Invalid.", 400);
  }
  return true;
};

/**
 *
 * @param {*} message
 * @param {*} destination
 * @returns contactId
 * If contactId is not provided via externalId, we look for the lookup key
 * inside webapp config.
 * We have put two level dynamic mapping here.
 * If the lookup key is not found we fallback to email. If email is also not provided, we throw error.
 */
const searchContactId = async (message, destination, identifyFlag) => {
  const { lookUpField, userName, password, subDomainName } = destination.Config;
  let searchContactsResponse;
  let contactId;
  const traits = getFieldValueFromMessage(message, "traits");
  let propertyName;

  if (!traits) {
    throw new CustomError("Invalid traits value for lookup field", 400);
  }

  // lookupField key provided in Config.lookupField not found in traits
  // then default it to email
  if (!traits[`${lookUpField}`]) {
    propertyName = "email";

    if (!traits?.email) {
      //identifyFlag help us to determine the output depending on what is the request type
      if (identifyFlag) {
        return null;
      }
      throw new CustomError(
        "email i.e a default lookup field for contact lookup not found in traits",
        400
      );
    }
  } else {
    // look for propertyName (key name) in traits
    // Config.lookupField -> lookupField
    // traits: { lookupField: email }
    propertyName = lookUpField;
  }

  // extract its value from the known propertyName (key name)
  // if not found in our structure then look for it in traits
  // Config.lookupField -> lookupField
  // eg: traits: { lookupField: email, email: "test@test.com" }
  const value =
    getFieldValueFromMessage(message, propertyName) ||
    traits[`${propertyName}`];

  if (!value) {
    throw new CustomError(
      ` '${propertyName}' lookup field for contact lookup not found in traits`,
      400
    );
  }
  const basicAuth = Buffer.from(`${userName}:${password}`).toString("base64");

  const requestOptions = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`
    }
  };
  //axios call made to get contacts with filters
  propertyName=fieldMap[propertyName];
  searchContactsResponse = await httpGET(
    createAxiosUrl(subDomainName, propertyName, value),
    requestOptions
  );

  searchContactsResponse = processAxiosResponse(searchContactsResponse);
  if (searchContactsResponse.status !== 200) {
    throw new CustomError(
      `Failed to get Mautic contacts: ${JSON.stringify(
        searchContactsResponse.response
      )}`,
      searchContactsResponse.status
    );
  }
  // throw error if more than one contact is found as it's ambiguous
  if (searchContactsResponse.response?.total > 1) {
    if (!identifyFlag) {
      throw new CustomError(
        "Unable to get single Mautic contact. More than one contacts found. Retry with unique lookupfield and lookupValue",
        400
      );
    }
    return null;
  } else if (searchContactsResponse.response.total == 1) {
    // a single and unique contact found
    const { contacts } = searchContactsResponse?.response;
    contactId =
      Object.keys(contacts).length === 1 ? Object.keys(contacts)[0] : null;
  } else {
    // contact not found
    if (!identifyFlag) {
      throw new CustomError(
        " No contacts found. Retry with unique lookupfield and lookupValue"
      );
    }
    contactId = null;
  }
  return contactId;
};

module.exports = {
  FIELDS,
  isDate,
  validateEmail,
  validatePhone,
  deduceAddressFields,
  validatePayload,
  searchContactId,
  refinePayloadFields
};
