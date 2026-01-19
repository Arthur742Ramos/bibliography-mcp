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

// Container App
// Note: Uses ephemeral volume for SQLite cache. Cache resets on container restart
// but avoids Azure Files locking issues. Cache falls back to in-memory if needed.
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
          storageType: 'EmptyDir'
        }
      ]
      scale: {
        minReplicas: environment == 'prod' ? 1 : 0
        maxReplicas: environment == 'prod' ? 3 : 1
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// Outputs
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output logAnalyticsWorkspaceId string = logAnalytics.id
