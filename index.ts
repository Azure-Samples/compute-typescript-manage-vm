import * as msRest from "@azure/ms-rest-js";
import * as msRestAzure from "@azure/ms-rest-azure-js";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { ComputeManagementClient, ComputeManagementModels, ComputeManagementMappers } from "@azure/arm-compute";

const subscriptionId: string = process.env["AZURE_SUBSCRIPTION_ID"]!;

msRestNodeAuth.interactiveLogin().then((creds: any) => {
  const client = new ComputeManagementClient(creds, subscriptionId);
  client.operations.list().then((result: any) => {
    console.log("The result is:");
    console.log(result);
  });
}).catch((err: any) => {
  console.error(err);
});
