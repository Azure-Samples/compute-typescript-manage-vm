import { ComputeManagementClient, VirtualMachine } from "@azure/arm-compute";
import {
  NetworkInterface,
  NetworkManagementClient,
  PublicIPAddress,
  VirtualNetwork,
} from "@azure/arm-network";
import { DefaultAzureCredential } from "@azure/identity";

function getSubscriptionId(): string {
  const subscriptionId: string | undefined =
    process.env["AZURE_SUBSCRIPTION_ID"];

  if (!subscriptionId) {
    console.error("Please set Azure subscription environmental variable");
    process.exit(1);
  }

  return subscriptionId!;
}

async function getAzureClients(subscriptionId: string): Promise<{
  computeClient: ComputeManagementClient;
  networkClient: NetworkManagementClient;
}> {
  const credentials = new DefaultAzureCredential();
  return {
    computeClient: new ComputeManagementClient(credentials, subscriptionId),
    networkClient: new NetworkManagementClient(credentials, subscriptionId),
  };
}

async function listVirtualMachines(computeClient: ComputeManagementClient) {
  console.log(
    `Listing virtual machine in ${computeClient.subscriptionId} subscription`
  );
  const virtualMachines = await computeClient.virtualMachines.listAll();
  const virtualMachinesArray = new Array();
  let index = 0;
  for await (let virtualMachine of virtualMachines) {
    console.log(
      `${index++}): ${virtualMachine.name}\t\t${virtualMachine.location}\t${
        virtualMachine.provisioningState
      }`
    );
    virtualMachinesArray.push(virtualMachine);
  }
  console.log(`Found ${index} virtual machines:`);

  return virtualMachinesArray;
}

async function createVirtualNetwork(
  networkClient: NetworkManagementClient,
  location: string,
  resourceGroupName: string,
  name: string,
  parameters: VirtualNetwork = {
    location: location,
    addressSpace: {
      addressPrefixes: ["10.0.0.0/16"],
    },
    subnets: [
      {
        name: `sub${name}`,
        addressPrefix: "10.0.0.0/24",
      },
    ],
  }
) {
  console.log(
    `Creating "${name}" virtual network in ${resourceGroupName} resource group in ${networkClient.subscriptionId} subscription`
  );
  await networkClient.virtualNetworks.beginCreateOrUpdateAndWait(
    resourceGroupName,
    name,
    parameters
  );
  const virtualNetwork = await networkClient.virtualNetworks.get(
    resourceGroupName,
    name
  );

  console.log(
    `Virtual network "${virtualNetwork.name}" was created successfully`
  );
  return virtualNetwork;
}

async function createPublicIpAddress(
  networkClient: NetworkManagementClient,
  location: string,
  resourceGroupName: string,
  name: string,
  parameters: PublicIPAddress = {
    location: location,
    publicIPAllocationMethod: "Dynamic",
    dnsSettings: {
      domainNameLabel: name,
    },
  }
) {
  console.log(
    `Creating "${name}" public IP address in ${resourceGroupName} resource group in ${networkClient.subscriptionId} subscription`
  );
  await networkClient.publicIPAddresses.beginCreateOrUpdateAndWait(
    resourceGroupName,
    name,
    parameters
  );
  const publicIPAddress = await networkClient.publicIPAddresses.get(
    resourceGroupName,
    name
  );
  console.log(
    `Virtual network "${publicIPAddress.name}" was created successfully`
  );
  return publicIPAddress;
}

async function createNetworkInterface(
  networkClient: NetworkManagementClient,
  location: string,
  resourceGroupName: string,
  name: string,
  virtualNetwork: VirtualNetwork,
  publicIp: PublicIPAddress,
  parameters: NetworkInterface = {
    location: location,
    ipConfigurations: [
      {
        name: name,
        privateIPAllocationMethod: "Dynamic",
        subnet: virtualNetwork.subnets![0],
        publicIPAddress: publicIp,
      },
    ],
  }
) {
  console.log(
    `Creating "${name}" network interface in ${resourceGroupName} resource group in ${networkClient.subscriptionId} subscription`
  );
  await networkClient.networkInterfaces.beginCreateOrUpdateAndWait(
    resourceGroupName,
    name,
    parameters
  );
  const networkInterface = await networkClient.networkInterfaces.get(
    resourceGroupName,
    name
  );
  console.log(
    `Virtual network "${networkInterface.name}" was created successfully`
  );
  return networkInterface;
}

async function createVirtualMachine(
  computeClient: ComputeManagementClient,
  location: string,
  resourceGroupName: string,
  virtualMachineName: string,
  parameters: VirtualMachine = {
    location: location,
  }
) {
  console.log(
    `Creating "${virtualMachineName}" virtual machine in ${resourceGroupName} resource group in ${computeClient.subscriptionId} subscription`
  );
  await computeClient.virtualMachines.beginCreateOrUpdateAndWait(
    resourceGroupName,
    virtualMachineName,
    parameters
  );
  const virtualMachine = await computeClient.virtualMachines.get(
    resourceGroupName,
    virtualMachineName
  );
  console.log(
    `Created ${virtualMachine.name} (${virtualMachine.vmId}) virtual machine.`
  );
  return virtualMachine;
}

async function deleteResource(
  resourceGroupName: string,
  resourceName: string,
  resource: any
) {
  console.log(
    `Deleting "${resourceName}" resource in ${resourceGroupName} resource group`
  );
  await resource.beginDeleteAndWait(resourceGroupName, resourceName);
  console.log(`Resource "${resourceName}" deleted successfully.`);
}

function getNameSuffix(): string {
  const now = new Date();
  const pad = (n: number, num: number): string => {
    const padString = "0".repeat(n);
    return (padString + num).slice(-n);
  };

  const nameSuffix =
    pad(2, now.getMonth()) +
    pad(2, now.getDate()) +
    pad(2, now.getHours()) +
    pad(2, now.getMinutes()) +
    pad(2, now.getSeconds());

  return nameSuffix;
}

(async function () {
  try {
    const subscriptionId: string = getSubscriptionId();
    const resourceGroupName = "samples";

    const nameSuffix = getNameSuffix();
    const location = "eastus";
    const virtualMachineName = "vm" + nameSuffix;
    const virtualNetworkName = "network" + nameSuffix;
    const publicIpName = "ip" + nameSuffix;
    const networkInterfaceName = "nic" + nameSuffix;

    const { computeClient, networkClient } = await getAzureClients(
      subscriptionId
    );

    await listVirtualMachines(computeClient);

    const virtualNetwork = await createVirtualNetwork(
      networkClient,
      location,
      resourceGroupName,
      virtualNetworkName
    );
    const publicIp = await createPublicIpAddress(
      networkClient,
      location,
      resourceGroupName,
      publicIpName
    );
    const networkInterface = await createNetworkInterface(
      networkClient,
      location,
      resourceGroupName,
      networkInterfaceName,
      virtualNetwork,
      publicIp
    );

    await createVirtualMachine(
      computeClient,
      location,
      resourceGroupName,
      virtualMachineName,
      {
        location: location,
        hardwareProfile: {
          vmSize: "Standard_D2s_v3",
        },
        osProfile: {
          computerName: virtualMachineName,
          adminUsername: "MyUsername",
          adminPassword: "MyPa$$w0rd",
        },
        networkProfile: {
          networkInterfaces: [{ primary: true, id: networkInterface.id }],
        },
        storageProfile: {
          imageReference: {
            sku: "20_04-lts-gen2",
            publisher: "Canonical",
            version: "latest",
            offer: "0001-com-ubuntu-server-focal",
          },
          osDisk: {
            caching: "ReadWrite",
            managedDisk: {
              storageAccountType: "Standard_LRS",
            },
            name: `disk${nameSuffix}`,
            createOption: "FromImage",
          },
        },
      }
    );

    await listVirtualMachines(computeClient);

    await deleteResource(
      resourceGroupName,
      virtualMachineName,
      computeClient.virtualMachines
    );
    await deleteResource(
      resourceGroupName,
      networkInterfaceName,
      networkClient.networkInterfaces
    );
    await deleteResource(
      resourceGroupName,
      publicIpName,
      networkClient.publicIPAddresses
    );
    await deleteResource(
      resourceGroupName,
      virtualNetworkName,
      networkClient.virtualNetworks
    );
  } catch (error: any) {
    console.error(error.message);
  }
})();
