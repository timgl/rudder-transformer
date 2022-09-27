/* eslint-disable no-unused-vars */
const { default: axios } = require("axios");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const shell = require("shelljs");
const crypto = require("crypto");
const dockerUtils = require("./docker-utils");
const logger = require("../logger");

const FUNCTION_REPOSITORY = "rudderlabs/user-functions-test";
const OPENFAAS_NAMESPACE = "openfaas-fn";
const DESTRUCTION_TIMEOUT_IN_MS = 2 * 60 * 1000;

const resourcesBasePath = path.join(__dirname, "..", "resources", "openfaas");
const buildsFolderPrefix = "openfaas-builds-";

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function weakHash(value) {
  return crypto
    .createHash("sha1")
    .update(value)
    .digest("hex");
}

function buildFunctionName(transformationName, id) {
  let fnName = transformationName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");

  if (id) {
    fnName += `-${id.trim().replace(/\s+/g, "")}`;
  }

  return fnName;
}

function buildImageName(versionId, code) {
  let tagName = versionId;

  if (versionId === "testVersionId") {
    tagName = hash(code);
  }

  return `${FUNCTION_REPOSITORY}:${tagName}`;
}

async function buildContext(code) {
  const buildDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), buildsFolderPrefix)
  );
  const funcDir = path.join(buildDir, "function");

  await fs.promises.mkdir(funcDir);
  await fs.copy(resourcesBasePath, buildDir);

  await fs.promises.writeFile(path.join(funcDir, "__init__.py"), "");
  await fs.promises.writeFile(path.join(funcDir, "handler.py"), code);

  logger.debug("Done building context at: ", buildDir);
  return buildDir;
}

async function dockerizeAndPush(buildDir, imageName) {
  shell.cd(buildDir);

  await dockerUtils.buildImage(".", "-t", imageName);
  await dockerUtils.pushImage(imageName);
}

function deleteFunction(functionName) {
  return axios.delete(
    new URL(
      path.join(process.env.OPENFAAS_GATEWAY_URL, "/system/functions")
    ).toString(),
    {
      data: {
        functionName
      }
    }
  );
}

async function isFunctionDeployed(functionName) {
  const deployedFunctions = await axios.get(
    new URL(
      path.join(process.env.OPENFAAS_GATEWAY_URL, "/system/functions")
    ).toString()
  );

  let matchFound = false;

  deployedFunctions.data.forEach(deployedFunction => {
    if (deployedFunction.name === functionName) matchFound = true;
  });

  return matchFound;
}

async function deployFunction(imageName, functionName, testMode) {
  const payload = {
    service: functionName,
    name: functionName,
    image: imageName,
    namespace: OPENFAAS_NAMESPACE,
    envProcess: "python index.py",
    labels: {
      faas_function: functionName
    },
    annotations: {
      "prometheus.io.scrape": "false"
    }
  };

  await axios.post(
    new URL(
      path.join(process.env.OPENFAAS_GATEWAY_URL, "/system/functions")
    ).toString(),
    payload
  );
}

async function faasDeploymentHandler(imageName, functionName, code, testMode) {
  const buildDir = await buildContext(code);
  await dockerizeAndPush(buildDir, imageName);
  await deployFunction(imageName, functionName, testMode);

  fs.rmdir(buildDir, { recursive: true, force: true });
}

async function faasInvocationHandler(
  transformationName,
  code,
  versionId,
  events = [],
  testMode = false,
  override = false
) {
  const imageName = buildImageName(versionId, code);
  const functionName = buildFunctionName(
    transformationName,
    versionId === "testVersionId" ? weakHash(code) : versionId
  );

  const isFnDeployed = await isFunctionDeployed(functionName);

  if (!isFnDeployed || override) {
    if (override) {
      await deleteFunction(functionName).catch(error => {
        logger.error(error.message);
      });
    }

    await faasDeploymentHandler(imageName, functionName, code, testMode);
  }

  const promises = [];

  events.forEach(event => {
    const promise = axios.post(
      new URL(
        path.join(process.env.OPENFAAS_GATEWAY_URL, "function", functionName)
      ).toString(),
      event
    );

    promises.push(promise);
  });

  if (testMode) {
    setTimeout(async () => {
      await deleteFunction(functionName).catch(_e => {});
    }, DESTRUCTION_TIMEOUT_IN_MS);
  }

  return Promise.all(promises);
}

exports.faasDeploymentHandler = faasDeploymentHandler;
exports.faasInvocationHandler = faasInvocationHandler;
