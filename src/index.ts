import { Ed25519Keypair, JsonRpcProvider, RawSigner } from '@mysten/sui.js'
import { buildMintNftTx, NftClient } from '@originbyte/js-sdk'
import { inspect } from 'util'

async function run() {
    const provider = new JsonRpcProvider('https://fullnode.devnet.sui.io:443')
    const object = await provider.getObjectsOwnedByAddress('0x9db6a28b950590baa63509de3603ef7a2ced0a3c')
    console.log(object)
}

const PACKAGE_OBJECT_ID = '0xc8670160d3af6a605385f570a59344f5182d4267'
const COLLECTION_ID = '0x16ccac9ac3f10018b231855665fe22215a6f0edf'
const LAUNCHPAD_ID = '0x5c2633684eb47274d3e0c91c80e1abbe9d9c8e8c'
const AUTHORITY_ID = '0x69dd15849c0be531bc2eabb70a4d1077da2d0411'

export function normalizeMnemonics(mnemonics: string): string {
    return mnemonics
        .trim()
        .split(/\s+/)
        .map((part) => part.toLowerCase())
        .join(' ')
}

export const provider = new JsonRpcProvider('https://fullnode.devnet.sui.io')

export const creatorMnemonic = 'extend tuna track bitter update provide grant dolphin club govern puzzle slam'
export const buyerMnemonic = 'resemble useless rug begin must slender garment faint smart square once dove'

export const creatorKeypair = Ed25519Keypair.deriveKeypair(creatorMnemonic)
export const creatorSigner = new RawSigner(creatorKeypair, provider)

export const buyerKeypair = Ed25519Keypair.deriveKeypair(buyerMnemonic)
export const buyerSigner = new RawSigner(buyerKeypair, provider)

export const client = new NftClient(provider)

async function mintToLaunchpad() {
    const client = new NftClient(provider)
    const collections = await client.getCollectionsForAddress(`0x${creatorKeypair.getPublicKey().toSuiAddress()}`)

    const collectionsForWallet = collections.filter((_) => _.packageObjectId === PACKAGE_OBJECT_ID)

    console.log('collectionForWallet', collectionsForWallet)
    if (collectionsForWallet.length) {
        const collection = collectionsForWallet[0]
        const mintNftTransaction = NftClient.buildMintNftTx({
            mintAuthority: collection.mintAuthorityId,
            moduleName: 'suimarines',
            name: 'First Releap NFT',
            description: 'First Releap NFT',
            packageObjectId: collection.packageObjectId,
            url: 'https://i.imgur.com/D5yhcTC.png',
            attributes: {
                Rarity: 'Ultra-rare',
                Author: 'Releap',
            },
            launchpadId: LAUNCHPAD_ID,
        })

        console.log(inspect(mintNftTransaction, { colors: true, depth: 20 }))
        console.log('signer', creatorKeypair.getPublicKey().toSuiAddress())
        const mintResult = await creatorSigner.executeMoveCallWithRequestType(mintNftTransaction)
        console.log('mintResult', mintResult)
    }
}

async function enableSales() {
    const markets = await client.getMarketsByParams({ objectIds: [LAUNCHPAD_ID] })
    if (markets[0]) {
        const market = markets[0]
        if (market.data.live) {
            throw new Error('Market is already live')
        }
        console.log('Market:', market)
        const mintNftTransaction = NftClient.buildEnableSales({
            packageObjectId: market.data.packageObjectId,
            launchpadId: market.data.id,
            collectionType: `${market.data.packageObjectId}::${market.data.packageModule}::${market.data.packageModuleClassName}`,
        })
        const enableSalesResult = await creatorSigner.executeMoveCallWithRequestType(mintNftTransaction)
        console.log('enableSalesResult', enableSalesResult)
    }
}

async function buyFromLaunchpad() {
    const markets = await client.getMarketsByParams({ objectIds: [LAUNCHPAD_ID] })
    console.log(buyerKeypair.getPublicKey().toSuiAddress())
    if (markets[0]) {
        const market = markets[0]
        if (!market.data.live) {
            throw new Error('Market is not live yet')
        }
        if (!market.data.sales.find((s) => s.nfts.length > 0)) {
            throw new Error('Market has no sales')
        }

        const buyCertificateTransaction = NftClient.buildBuyNftCertificate({
            collectionType: `${market.data.packageObjectId}::${market.data.packageModule}::${market.data.packageModuleClassName}`,
            packageObjectId: market.data.packageObjectId,
            launchpadId: market.data.id,
            wallet: '0x6a723cc8c7aa9303be8140a7c5402689c5d5f43d', // Coin address to pay for NFT
        })

        const buyResult = await buyerSigner.executeMoveCallWithRequestType(buyCertificateTransaction)
        console.log('buyResult', buyResult)
    }
}

async function claimCertificate() {
    const address = await buyerSigner.getAddress()

    const certificates = (await client.getNftCertificatesForAddress(`0x${address}`)).filter(
        (_) => _.data.packageObjectId === PACKAGE_OBJECT_ID,
    )
    console.log('certificate', certificates)
    if (certificates.length) {
        const nftForCert = certificates[0].data.nftId
        const nfts = await client.getNftsById({ objectIds: [nftForCert] })
        if (nfts.length) {
            const nft = nfts[0]
            console.log('nft', nft)
            const claimCertificateTx = NftClient.buildClaimNftCertificate({
                collectionType: `${nft.data.packageObjectId}::${nft.data.packageModule}::${nft.data.packageModuleClassName}`,
                packageObjectId: nft.data.packageObjectId,
                launchpadId: certificates[0].data.launchpadId,
                nftId: nft.data.id,
                recepient: `0x${address}`,
                nftType: nft.data.nftType,
                certificateId: certificates[0].data.id,
            })
            console.log('certificate', certificates, claimCertificateTx)
            const claimCertificateResult = await buyerSigner.executeMoveCallWithRequestType(claimCertificateTx)
            console.log('claimCertificateResult', claimCertificateResult)
        }
    }
}
// mintToLaunchpad()
// enableSales()
//buyFromLaunchpad()
claimCertificate()
