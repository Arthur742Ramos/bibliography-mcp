# Deploy Bibliography MCP to Azure
# Usage: ./deploy.ps1 -ResourceGroup <name> -Environment <dev|staging|prod>

param(
    [Parameter(Mandatory=$true)]
    [string]$ResourceGroup,

    [Parameter(Mandatory=$false)]
    [ValidateSet('dev', 'staging', 'prod')]
    [string]$Environment = 'dev',

    [Parameter(Mandatory=$false)]
    [string]$Location = 'eastus',

    [Parameter(Mandatory=$false)]
    [string]$ContainerImage = '',

    [Parameter(Mandatory=$false)]
    [string]$ContainerRegistryServer = '',

    [Parameter(Mandatory=$false)]
    [string]$ContainerRegistryUsername = '',

    [Parameter(Mandatory=$false)]
    [string]$ContainerRegistryPassword = ''
)

$ErrorActionPreference = 'Stop'

Write-Host "Deploying Bibliography MCP Server to Azure" -ForegroundColor Cyan
Write-Host "Resource Group: $ResourceGroup"
Write-Host "Environment: $Environment"
Write-Host "Location: $Location"

# Check if logged in to Azure
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Please log in to Azure first:" -ForegroundColor Yellow
    az login
}

# Create resource group if it doesn't exist
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq 'false') {
    Write-Host "Creating resource group $ResourceGroup..." -ForegroundColor Yellow
    az group create --name $ResourceGroup --location $Location
}

# Build deployment parameters
$params = @{
    location = $Location
    environment = $Environment
}

if ($ContainerImage) {
    $params.containerImage = $ContainerImage
}

if ($ContainerRegistryServer) {
    $params.containerRegistryServer = $ContainerRegistryServer
}

if ($ContainerRegistryUsername) {
    $params.containerRegistryUsername = $ContainerRegistryUsername
}

if ($ContainerRegistryPassword) {
    $params.containerRegistryPassword = $ContainerRegistryPassword
}

$paramsJson = $params | ConvertTo-Json -Compress
$paramsFile = New-TemporaryFile
$paramsJson | Out-File -FilePath $paramsFile -Encoding UTF8

Write-Host "Deploying Bicep template..." -ForegroundColor Yellow

# Deploy the Bicep template
$deployment = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file "$PSScriptRoot/main.bicep" `
    --parameters "@$paramsFile" `
    --output json | ConvertFrom-Json

Remove-Item $paramsFile

if ($deployment.properties.provisioningState -eq 'Succeeded') {
    Write-Host "`nDeployment successful!" -ForegroundColor Green

    $outputs = $deployment.properties.outputs
    Write-Host "`nOutputs:" -ForegroundColor Cyan
    Write-Host "  Container App URL: $($outputs.containerAppUrl.value)"
    Write-Host "  Log Analytics ID: $($outputs.logAnalyticsWorkspaceId.value)"
    Write-Host "  Storage Account: $($outputs.storageAccountName.value)"
} else {
    Write-Host "`nDeployment failed!" -ForegroundColor Red
    Write-Host $deployment.properties.error
    exit 1
}
