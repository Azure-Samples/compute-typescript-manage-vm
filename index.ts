import { interactiveLogin } from "@azure/ms-rest-nodeauth";
import { ComputeManagementClient, ComputeManagementModels as Models } from "@azure/arm-compute";
import { StorageManagementClient, StorageManagementModels as StorageModels } from "@azure/arm-storage";
import { NetworkManagementClient, NetworkManagementModels as NetworkModels } from "@azure/arm-network";
import { RestError, RestResponse, HttpResponse } from "@azure/ms-rest-js";
import { LROPoller, createLROPollerFromInitialResponse } from "@azure/ms-rest-azure-js";

function getSubscriptionId(): string {
  const subscriptionId: string | undefined = process.env["AZURE_SUBSCRIPTION_ID"];

  if (!subscriptionId) {
    console.error("Please set Azure subscription environmental variable");
    process.exit(1);
  }

  return subscriptionId!;
}

async function getAzureClients(
  subscriptionId: string
): Promise<{
  compute: ComputeManagementClient;
  storage: StorageManagementClient;
  network: NetworkManagementClient;
}> {
  const credentials = await interactiveLogin();
  return {
    compute: new ComputeManagementClient(credentials, subscriptionId),
    storage: new StorageManagementClient(credentials, subscriptionId),
    network: new NetworkManagementClient(credentials, subscriptionId)
  };
}

async function listVirtualMachines(computeClient: ComputeManagementClient): Promise<Models.VirtualMachinesListAllResponse> {
  console.log(`Listing virtual machine in ${computeClient.subscriptionId} subscription`);
  const virtualMachines: Models.VirtualMachinesListAllResponse = await computeClient.virtualMachines.listAll();

  console.log(`Found ${virtualMachines.length} virtual machines:`);
  virtualMachines.forEach((virtualMachine: Models.VirtualMachine, index: number) => {
    console.log(`${index}): ${virtualMachine.name}\t\t${virtualMachine.location}\t${virtualMachine.provisioningState}`);
  });

  return virtualMachines;
}

async function createStorageAccount(
  storageClient: StorageManagementClient,
  resourceGroupName: string,
  accountName: string,
  parameters: StorageModels.StorageAccountCreateParameters = {
    sku: {
      name: "Standard_LRS"
    },
    kind: "StorageV2",
    location: "eastus2"
  }
): Promise<StorageModels.StorageAccountsCreateResponse> {
  console.log(`Creating "${accountName}" storage account in ${resourceGroupName} resource group in ${storageClient.subscriptionId} subscription`);
  const storageAccount = await storageClient.storageAccounts.create(resourceGroupName, accountName, parameters);

  console.log(`Storage account "${storageAccount.name} was created successfully`);
  return storageAccount;
}

async function deleteStorageAccount(storageClient: StorageManagementClient, resourceGroupName: string, storageAccountName: string): Promise<RestResponse> {
  console.log(`Deleting "${storageAccountName}" storage account in ${resourceGroupName} resource group in ${storageClient.subscriptionId} subscription`);
  const restResponse = await storageClient.storageAccounts.deleteMethod(resourceGroupName, storageAccountName);

  console.log(`Storage account "${storageAccountName} was removed successfully`);
  return restResponse;
}

async function createVirtualNetwork(
  networkClient: NetworkManagementClient,
  resourceGroupName: string,
  name: string,
  parameters: NetworkModels.VirtualNetwork = {
    location: "eastus2",
    addressSpace: {
      addressPrefixes: ["10.0.0.0/16"]
    },
    subnets: [
      {
        name: `sub${name}`,
        addressPrefix: "10.0.0.0/24"
      }
    ]
  }
): Promise<NetworkModels.VirtualNetwork> {
  console.log(`Creating "${name}" virtual network in ${resourceGroupName} resource group in ${networkClient.subscriptionId} subscription`);
  const virtualNetwork = await networkClient.virtualNetworks.createOrUpdate(resourceGroupName, name, parameters);

  console.log(`Virtual network "${virtualNetwork.name} was created successfully`);
  return virtualNetwork;
}

async function deleteVirtualNetwork(networkClient: NetworkManagementClient, resourceGroupName: string, name: string): Promise<RestResponse> {
  console.log(`Deleting "${name}" virtual network in ${resourceGroupName} resource group in ${networkClient.subscriptionId} subscription`);
  const restResponse = await networkClient.virtualNetworks.deleteMethod(resourceGroupName, name);

  console.log(`Virtual network "${name} was deleted successfully`);
  return restResponse;
}

async function createPublicIpAddress(
  networkClient: NetworkManagementClient,
  resourceGroupName: string,
  name: string,
  parameters: NetworkModels.PublicIPAddress = {
    location: "eastus2",
    publicIPAllocationMethod: "Dynamic",
    dnsSettings: {
      domainNameLabel: name
    }
  }
): Promise<NetworkModels.PublicIPAddress> {
  console.log(`Creating "${name}" public IP address in ${resourceGroupName} resource group in ${networkClient.subscriptionId} subscription`);
  const publicIPAddress = await networkClient.publicIPAddresses.createOrUpdate(resourceGroupName, name, parameters);

  console.log(`Virtual network "${publicIPAddress.name} was created successfully`);
  return publicIPAddress;
}

async function createNetworkInterface(
  networkClient: NetworkManagementClient,
  resourceGroupName: string,
  name: string,
  virtualNetwork: NetworkModels.VirtualNetwork,
  publicIp: NetworkModels.PublicIPAddress,
  parameters: NetworkModels.NetworkInterface = {
    location: "eastus2",
    ipConfigurations: [
      {
        name: name,
        privateIPAllocationMethod: "Dynamic",
        subnet: virtualNetwork.subnets![0],
        publicIPAddress: publicIp
      }
    ]
  }
): Promise<NetworkModels.NetworkInterface> {
  console.log(`Creating "${name}" network interface in ${resourceGroupName} resource group in ${networkClient.subscriptionId} subscription`);
  const networkInterface = await networkClient.networkInterfaces.createOrUpdate(resourceGroupName, name, parameters);

  console.log(`Virtual network "${networkInterface.name} was created successfully`);
  return networkInterface;
}

async function createVirtualMachine(
  computeClient: ComputeManagementClient,
  resourceGroupName: string,
  virtualMachineName: string,
  parameters: Models.VirtualMachine = {
    location: "eastus2"
  }
): Promise<Models.VirtualMachine> {
  console.log(`Creating "${virtualMachineName}" virtual machine in ${resourceGroupName} resource group in ${computeClient.subscriptionId} subscription`);
  const virtualMachine: Models.VirtualMachine = await computeClient.virtualMachines.createOrUpdate(resourceGroupName, virtualMachineName, parameters);

  console.log(`Created ${virtualMachine.name} (${virtualMachine.vmId}) virtual machine.`);
  return virtualMachine;
}

async function deleteVirtualMachine(
  computeClient: ComputeManagementClient,
  resourceGroupName: string,
  virtualMachineName: string
): Promise<RestResponse> {
  console.log(`Deleting "${virtualMachineName}" virtual machine in ${resourceGroupName} resource group in ${computeClient.subscriptionId} subscription`);
  const restResponse: RestResponse = await computeClient.virtualMachines.deleteMethod(resourceGroupName, virtualMachineName);

  console.log(`Virtual machine "${virtualMachineName}" deleted successfully.`);
  return restResponse;
}

function getNameSuffix(): string {
  const now = new Date();
  const pad = (n: number, num: number): string => {
    const padString = "0".repeat(n);
    return (padString + num).slice(-n);
  };

  const nameSuffix = now.getFullYear()
    + pad(2, now.getMonth())
    + pad(2, now.getDate())
    + pad(2, now.getHours())
    + pad(2, now.getMinutes())
    + pad(2, now.getSeconds());

  return nameSuffix;
}

(async function() {
  try {
    const subscriptionId: string = getSubscriptionId();
    const resourceGroupName = "samples";

    const nameSuffix = getNameSuffix();
    const virtualMachineName = "MySampleVM";
    const storageAccountName = "storage20190417151839"; // "storage" + nameSuffix; // Storage account name must be between 3 and 24 characters in length and use numbers and lower-case letters only
    const virtualNetworkName = "network" + nameSuffix;
    const publicIpName = "ip" + nameSuffix;
    const networkInterfaceName = "nic" + nameSuffix;

    const azureClients = await getAzureClients(subscriptionId);

    await listVirtualMachines(azureClients.compute);

    // const storageAccount = await createStorageAccount(azureClients.storage, resourceGroupName, storageAccountName);
    const virtualNetwork = await createVirtualNetwork(azureClients.network, resourceGroupName, virtualNetworkName);
    const publicIp = await createPublicIpAddress(azureClients.network, resourceGroupName, publicIpName);
    const networkInterface = await createNetworkInterface(azureClients.network, resourceGroupName, networkInterfaceName, virtualNetwork, publicIp);

    await createVirtualMachine(azureClients.compute, resourceGroupName, virtualMachineName, {
      location: "eastus2",
      hardwareProfile: {
        vmSize: "Basic_A0"
      },
      osProfile: {
        computerName: virtualMachineName,
        adminUsername: "MyUsername",
        adminPassword: "MyPa$$w0rd"
      },
      networkProfile: {
        networkInterfaces: [{ primary: true, id: networkInterface.id }]
      },
      storageProfile: {
        imageReference: {
          sku: "2016-Datacenter",
          publisher: "MicrosoftWindowsServer",
          version: "latest",
          offer: "WindowsServer"
        },
        osDisk: {
          caching: "ReadWrite",
          managedDisk: {
            "storageAccountType": "Standard_LRS"
          },
          name: "myVMosdisk",
          createOption: "FromImage"
}
      }
    });

    await listVirtualMachines(azureClients.compute);

    await deleteVirtualMachine(azureClients.compute, resourceGroupName, virtualMachineName)
    // await deleteVirtualNetwork(azureClients.network, resourceGroupName, virtualNetworkName);
    // await deleteStorageAccount(azureClients.storage, resourceGroupName, storageAccountName);
  } catch (error) {
    const restError: RestError = error;
    console.error(restError.message);
    console.error(JSON.stringify(error, undefined, " "));
  }
})();
