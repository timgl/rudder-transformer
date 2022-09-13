const { join } = require("path");
const { V2 } = require("rudder-transformer-cdk");

const singleWorkflow = V2.WorkflowUtils.createFromFilePath(
  join(__dirname, "pinterest_tag_single_workflow.yaml")
);
const singleWorkflowEngine = new V2.WorkflowEngine(singleWorkflow, __dirname);
exports.singleWorkflowEngine = singleWorkflowEngine;

const batchWorkflow = V2.WorkflowUtils.createFromFilePath(
  join(__dirname, "pinterest_tag_batch_workflow.yaml")
);
const batchWorkflowEngine = new V2.WorkflowEngine(batchWorkflow, __dirname);
exports.batchWorkflowEngine = batchWorkflowEngine;
