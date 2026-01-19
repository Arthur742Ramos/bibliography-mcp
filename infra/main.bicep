// Bibliography MCP Server - Azure Infrastructure
// Deploys Azure Container Apps for hosting the MCP server

@description('The location for all resources')
param location string = resourceGroup().location

@description('The name prefix for all resources')
param namePrefix string = 'bibmcp'

@description('The container image to deploy')
param containerImage string = 'ghcr.io/your-org/bibliography-mcp:latest'

@description('The container registry server (if using private registry)')
param containerRegistryServer string = ''

@description('The container registry username (if using private registry)')
@secure()
param containerRegistryUsername string = ''

@description('The container registry password (if using private registry)')
@secure()
param containerRegistryPassword string = ''

@description('Environment (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id)
var logAnalyticsName = '${namePrefix}-logs-${uniqueSuffix}'
var containerAppEnvName = '${namePrefix}-env-${uniqueSuffix}'
var containerAppName = '${namePrefix}-app-${environment}'
var storageName = 'bmcpst${uniqueSuffix}'

// Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Storage Account for persistent cache
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// File share for SQLite cache persistence
resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: 'bibliography-cache'
  properties: {
    shareQuota: 1 // 1 GB
  }
}

// Container Apps Environment
resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Storage mount for cache persistence
resource storageMount 'Microsoft.App/managedEnvironments/storages@2023-05-01' = {
  parent: containerAppEnvironment
  name: 'cache-storage'
  properties: {
    azureFile: {
      accountName: storageAccount.name
      accountKey: storageAccount.listKeys().keys[0].value
      shareName: fileShare.name
      accessMode: 'ReadWrite'
    }
  }
}

// Container App
// Note: Uses Azure Files with SQLite in DELETE journal mode (not WAL) for compatibility.
// Single replica to avoid concurrent writes to the same SQLite database.
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
      }
      registries: !empty(containerRegistryServer) ? [
        {
          server: containerRegistryServer
          username: containerRegistryUsername
          passwordSecretRef: 'registry-password'
        }
      ] : []
      secrets: !empty(containerRegistryPassword) ? [
        {
          name: 'registry-password'
          value: containerRegistryPassword
        }
      ] : []
    }
    template: {
      containers: [
        {
          name: 'bibliography-mcp'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: environment == 'prod' ? 'production' : 'development'
            }
            {
              name: 'CACHE_DIR'
              value: '/app/cache'
            }
            {
              name: 'MCP_TRANSPORT'
              value: 'http'
            }
            {
              name: 'PORT'
              value: '3000'
            }
          ]
          volumeMounts: [
            {
              volumeName: 'cache-volume'
              mountPath: '/app/cache'
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'cache-volume'
          storageType: 'AzureFile'
          storageName: storageMount.name
        }
      ]
      scale: {
        // Single replica to avoid SQLite concurrent write issues on Azure Files
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// Outputs
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output logAnalyticsWorkspaceId string = logAnalytics.id
output storageAccountName string = storageAccount.name
