import { Coin, JsonRpcProvider, SignableTransaction, SuiTransactionResponse } from '@mysten/sui.js'
import { ArtNft, ArtNftParser, CollectionParser, NftClient, NftCollection } from '@originbyte/js-sdk'
import DataLoader from 'dataloader'
import LRUCache from 'lru-cache'

export interface Wallet {
    signAndExecuteTransaction(transaction: SignableTransaction): Promise<SuiTransactionResponse>
}

export async function getNFTByOwner(address: string): Promise<ArtNft[]> {
    const nftClient = new NftClient()
    return await nftClient.fetchAndParseObjectsForAddress(address, ArtNftParser)
}

export async function getNFTById(nftId: string): Promise<ArtNft | null> {
    return await nftDataLoader.load(nftId)
}

export async function getNFTCollection(collectionId: string): Promise<NftCollection | null> {
    // this will batch loading the collection
    return await collectionDataLoader.load(collectionId)
}

export const collectionDataLoader = new DataLoader<string, NftCollection | null>(
    async (collectionIds) => {
        const nftClient = new NftClient()

        const result = (await nftClient.fetchAndParseObjectsById(
            collectionIds as string[],
            CollectionParser,
        )) as (NftCollection | null)[]

        return result
    },
    { cacheMap: new LRUCache({ max: 5000 }) },
)
export const nftDataLoader = new DataLoader<string, ArtNft | null>(
    async (nftIds) => {
        const nftClient = new NftClient()

        const result = (await nftClient.fetchAndParseObjectsById(nftIds as string[], ArtNftParser)) as (ArtNft | null)[]

        return nftIds.map((id) => result.find((item) => item?.id === id) ?? null)
    },
    { cacheMap: new LRUCache({ max: 5000 }) },
)

export async function buyFromLaunchpad(
    provider: JsonRpcProvider,
    wallet: Wallet,
    options: { launchpadId: string; buyer: string },
) {
    const client = new NftClient(provider)
    const markets = await client.getMarketsByParams({ objectIds: [options.launchpadId] })
    if (markets[0]) {
        const market = markets[0]
        if (!market.data.live) {
            throw new Error('Market is not live yet')
        }
        const price = market.data.sales.find((s) => s.nfts.length > 0)?.marketPrice
        if (price == null) {
            throw new Error('Market has no sales')
        }

        const coins = await provider.getCoinBalancesOwnedByAddress(options.buyer)
        const coinToBuy: any = coins.find((coin) => (Coin.getBalance(coin)?.valueOf() ?? BigInt(0)) >= BigInt(price))

        if (coinToBuy == null) {
            throw new Error('Fail no coin has enough balance')
        }

        const buyCertificateTransaction = NftClient.buildBuyNftCertificate({
            collectionType: `${market.data.packageObjectId}::${market.data.packageModule}::${market.data.packageModuleClassName}`,
            packageObjectId: market.data.packageObjectId,
            launchpadId: market.data.id,
            wallet: coinToBuy.details.data.fields.id.id, // Coin address to pay for NFT
        })

        await wallet.signAndExecuteTransaction({ kind: 'moveCall', data: buyCertificateTransaction })
    }
}

export async function claimCertificate(
    provider: JsonRpcProvider,
    wallet: Wallet,
    address: string,
    packageObjectId: string,
) {
    const client = new NftClient(provider)
    const certificates = (await client.getNftCertificatesForAddress(`0x${address}`)).filter(
        (_) => _.data.packageObjectId === packageObjectId,
    )
    if (certificates.length) {
        const nftForCert = certificates[0].data.nftId
        const nfts = await client.getNftsById({ objectIds: [nftForCert] })
        if (nfts.length) {
            const nft = nfts[0]
            const claimCertificateTx = NftClient.buildClaimNftCertificate({
                collectionType: `${nft.data.packageObjectId}::${nft.data.packageModule}::${nft.data.packageModuleClassName}`,
                packageObjectId: nft.data.packageObjectId,
                launchpadId: certificates[0].data.launchpadId,
                nftId: nft.data.id,
                recepient: `0x${address}`,
                nftType: nft.data.nftType,
                certificateId: certificates[0].data.id,
            })
            await wallet.signAndExecuteTransaction({ kind: 'moveCall', data: claimCertificateTx })
        }
    }
}

export async function listNFT(
    packageObjectId: string,
    marketplaceId: string,
    item: ArtNft,
    price: string,
    wallet: Wallet,
): Promise<string | undefined> {
    await wallet.signAndExecuteTransaction({
        kind: 'moveCall',
        data: {
            packageObjectId,
            module: 'marketplace',
            function: 'list',
            arguments: [marketplaceId, item.id, parseInt(price)],
            typeArguments: [
                `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
                '0x2::sui::SUI',
            ],
            gasBudget: 5000,
        },
    })

    return item.id
}

export async function cancelNFT(packageObjectId: string, marketplace: string, listingKey: string, wallet: Wallet) {
    const item = await getNFTById(listingKey)
    if (item == null) {
        throw new Error('Cannot resolve item')
    }
    await wallet.signAndExecuteTransaction({
        kind: 'moveCall',
        data: {
            packageObjectId,
            module: 'marketplace',
            function: 'delist_and_take',
            arguments: [marketplace, item.id],
            typeArguments: [
                `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
                `${item.packageObjectId}::${item.nftType}`,
                '0x2::sui::SUI',
            ],
            gasBudget: 5000,
        },
    })
}

export async function buyNFT(
    provider: JsonRpcProvider,
    packageObjectId: string,
    marketplace: string,
    listingKey: string,
    price: string,
    wallet: Wallet,
    buyerAddress: string,
) {
    const item = await getNFTById(listingKey)
    if (item == null) {
        throw new Error('Cannot resolve item')
    }
    const coins = await provider.getCoinBalancesOwnedByAddress(buyerAddress)
    const coinToBuy: any = coins.find((coin) => (Coin.getBalance(coin)?.valueOf() ?? BigInt(0)) >= BigInt(price))

    if (coinToBuy == null) {
        throw new Error('Fail no coin has enough balance')
    }

    await wallet.signAndExecuteTransaction({
        kind: 'moveCall',
        data: {
            packageObjectId,
            module: 'marketplace',
            function: 'buy_and_take',
            arguments: [marketplace, item.id, coinToBuy.details.data.fields.id.id, parseInt(price), item.collectionId], // TODO add coin here
            typeArguments: [
                `${item.packageObjectId}::${item.packageModule}::${item.packageModuleClassName}`,
                `${item.packageObjectId}::std_collection::StdMeta`,
                '0x2::sui::SUI',
            ],
            gasBudget: 5000,
        },
    })
}
