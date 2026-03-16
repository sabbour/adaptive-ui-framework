import { registerDiagramIcons } from '../../framework/components/ArchitectureDiagram';

// Register Azure icons for use in architecture diagrams.
// Icons use the naming convention "azure/{service-name}".
// Packs from other providers (AWS, GCP, etc.) would register under their own prefix.

// Vite requires explicit imports for SVG URLs
import aksAutomatic from './icons/Compute/AKS Automatic.svg?url';
import kubernetes from './icons/Compute/Kubernetes Services.svg?url';
import vm from './icons/Compute/Virtual Machine.svg?url';
import vmScaleSets from './icons/Compute/VM Scale Sets.svg?url';
import containerInstances from './icons/Containers/Container Instances.svg?url';
import containerRegistries from './icons/Containers/Container Registries.svg?url';
import batchAccounts from './icons/Containers/Batch Accounts.svg?url';

// Databases
import sqlDb from './icons/Databases/Azure SQL.svg?url';
import cosmosDb from './icons/Databases/Azure SQL.svg?url';
import postgreSql from './icons/Databases/Azure Database PostgreSQL Server.svg?url';
import mySql from './icons/Databases/Azure Database MySQL Server.svg?url';
import managedSql from './icons/Databases/SQL Managed Instance.svg?url';
import redis from './icons/Databases/Cache Redis.svg?url';

// Networking
import vnet from './icons/Networking/Virtual Networks.svg?url';
import loadBalancer from './icons/Networking/Load Balancers.svg?url';
import appGateway from './icons/Networking/Application Gateways.svg?url';
import frontDoor from './icons/Networking/Front Door and CDN Profiles.svg?url';
import dns from './icons/Networking/DNS Zones.svg?url';
import firewall from './icons/Networking/Firewalls.svg?url';
import nsg from './icons/Networking/Network Security Groups.svg?url';

// App Services
import appService from './icons/App Services/App Service Plans.svg?url';
import functionApp from './icons/IoT/Function Apps.svg?url';

// Storage
import storageAccounts from './icons/Storage/Storage Accounts.svg?url';

// Security
import keyVault from './icons/Security/Key Vaults.svg?url';

// Management + Governance
import monitor from './icons/Management + Governance/Monitor.svg?url';
import logAnalytics from './icons/Management + Governance/Application Insights.svg?url';

// AI + Machine Learning  
import cognitiveServices from './icons/AI + Machine Learning/Cognitive Services.svg?url';

// Integration
import eventGrid from './icons/Integration/Event Grid Topics.svg?url';
import apiManagement from './icons/DevOps/API Management Services.svg?url';

// General
import subscription from './icons/General/Subscriptions.svg?url';
import resourceGroup from './icons/General/Resource Groups.svg?url';

export function registerAzureDiagramIcons() {
  registerDiagramIcons({
    // Compute
    'azure/aks': kubernetes,
    'azure/aks-automatic': aksAutomatic,
    'azure/vm': vm,
    'azure/vmss': vmScaleSets,

    // Containers
    'azure/container-instances': containerInstances,
    'azure/acr': containerRegistries,
    'azure/batch': batchAccounts,

    // Databases
    'azure/sql': sqlDb,
    'azure/cosmos-db': cosmosDb,
    'azure/postgresql': postgreSql,
    'azure/mysql': mySql,
    'azure/sql-managed': managedSql,
    'azure/redis': redis,

    // Networking
    'azure/vnet': vnet,
    'azure/load-balancer': loadBalancer,
    'azure/app-gateway': appGateway,
    'azure/front-door': frontDoor,
    'azure/dns': dns,
    'azure/firewall': firewall,
    'azure/nsg': nsg,

    // App Services
    'azure/app-service': appService,
    'azure/function-app': functionApp,

    // Storage
    'azure/storage': storageAccounts,

    // Security
    'azure/key-vault': keyVault,

    // Monitoring
    'azure/monitor': monitor,
    'azure/log-analytics': logAnalytics,

    // AI
    'azure/cognitive-services': cognitiveServices,

    // Integration
    'azure/event-grid': eventGrid,
    'azure/api-management': apiManagement,

    // General
    'azure/subscription': subscription,
    'azure/resource-group': resourceGroup,
  });
}
