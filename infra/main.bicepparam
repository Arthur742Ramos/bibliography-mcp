using './main.bicep'

// Development parameters
param location = 'eastus'
param namePrefix = 'bibmcp'
param environment = 'dev'

// For local development, use a public image or build your own
// param containerImage = 'mcr.microsoft.com/hello-world:latest'

// For production, use your container registry
// param containerImage = 'your-registry.azurecr.io/bibliography-mcp:v1.0.0'
// param containerRegistryServer = 'your-registry.azurecr.io'
// param containerRegistryUsername = 'your-username'
// param containerRegistryPassword = 'your-password'
