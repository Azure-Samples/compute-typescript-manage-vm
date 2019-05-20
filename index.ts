import { interactiveLogin } from "@azure/ms-rest-nodeauth";
import { ComputeManagementClient, ComputeManagementModels as Models } from "@azure/arm-compute";
import { NetworkManagementClient, NetworkManagementModels as NetworkModels } from "@azure/arm-network";
import { RestError, RestResponse, RequestOptionsBase } from "@azure/ms-rest-js";

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
  computeClient: ComputeManagementClient;
  networkClient: NetworkManagementClient;
}> {
  const credentials = await interactiveLogin();
  return {
    computeClient: new ComputeManagementClient(credentials, subscriptionId),
    networkClient: new NetworkManagementClient(credentials, subscriptionId)
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

type DeleteMethod = (resourceGroupName: string, resourceName: string, options?: RequestOptionsBase) => Promise<RestResponse>;
type TDeletableResource = { deleteMethod: DeleteMethod };
async function deleteResource(resourceGroupName: string, resourceName: string, resource: TDeletableResource) {
  console.log(`Deleting "${resourceName}" resource in ${resourceGroupName} resource group`);
  const response = resource.deleteMethod(resourceGroupName, resourceName);

  console.log(`Resource "${resourceName}" deleted successfully.`);
  return response;
}

function getNameSuffix(): string {
  const now = new Date();
  const pad = (n: number, num: number): string => {
    const padString = "0".repeat(n);
    return (padString + num).slice(-n);
  };

  const nameSuffix = pad(2, now.getMonth()) + pad(2, now.getDate()) + pad(2, now.getHours()) + pad(2, now.getMinutes()) + pad(2, now.getSeconds());

  return nameSuffix;
}

(async function() {
  try {
    const subscriptionId: string = getSubscriptionId();
    const resourceGroupName = "samples";

    const nameSuffix = getNameSuffix();
    const virtualMachineName = "vm" + nameSuffix;
    const virtualNetworkName = "network" + nameSuffix;
    const publicIpName = "ip" + nameSuffix;
    const networkInterfaceName = "nic" + nameSuffix;

    const { computeClient, networkClient } = await getAzureClients(subscriptionId);

    await listVirtualMachines(computeClient);

    const virtualNetwork = await createVirtualNetwork(networkClient, resourceGroupName, virtualNetworkName);
    const publicIp = await createPublicIpAddress(networkClient, resourceGroupName, publicIpName);
    const networkInterface = await createNetworkInterface(networkClient, resourceGroupName, networkInterfaceName, virtualNetwork, publicIp);

    await createVirtualMachine(computeClient, resourceGroupName, virtualMachineName, {
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
          sku: "18.04-LTS",
          publisher: "Canonical",
          version: "latest",
          offer: "UbuntuServer"
        },
        osDisk: {
          caching: "ReadWrite",
          managedDisk: {
            storageAccountType: "Standard_LRS"
          },
          name: `disk${nameSuffix}`,
          createOption: "FromImage"
        }
      }
    });

    await listVirtualMachines(computeClient);

    await deleteResource(resourceGroupName, virtualMachineName, computeClient.virtualMachines);
    await deleteResource(resourceGroupName, networkInterfaceName, networkClient.networkInterfaces);
    await deleteResource(resourceGroupName, publicIpName, networkClient.publicIPAddresses);
    await deleteResource(resourceGroupName, virtualNetworkName, networkClient.virtualNetworks);
  } catch (error) {
    const restError: RestError = error;
    console.error(restError.message);
  }
})();
