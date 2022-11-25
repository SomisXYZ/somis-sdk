import {
    Coin,
    JsonRpcProvider,
    ObjectOwner,
    SignableTransaction,
    SuiMoveObject,
    SuiTransactionResponse,
} from '@mysten/sui.js'
import {
    ArtNft,
    ArtNftRpcResponse,
    NftClient,
    NftCollection,
    NftCollectionRpcResponse,
    NftType,
    SuiObjectParser,
} from '@originbyte/js-sdk'
import DataLoader from 'dataloader'
import LRUCache from 'lru-cache'

export * from '@originbyte/js-sdk'
export * from '@mysten/sui.js'

export interface Wallet {
    signAndExecuteTransaction(transaction: SignableTransaction): Promise<SuiTransactionResponse>
}

// eslint-disable-next-line max-len
const ArtNftRegex =
    /(0x[a-f0-9]{40})::nft::Nft<0x[a-f0-9]{40}::([a-zA-Z_]{1,})::([a-zA-Z_]{1,}), 0x[a-f0-9]{40}::([a-zA-Z_]{1,}::[a-zA-Z_]{1,})>/

// eslint-disable-next-line max-len
const CollectionRegex =
    /(0x[a-f0-9]{40})::collection::Collection<0x[a-f0-9]{40}::([a-zA-Z_]{1,})::([a-zA-Z_]{1,}), 0x[a-f0-9]{40}::std_collection::StdMeta>/

const parseObjectOwner = (owner: ObjectOwner) => {
    let ownerAddress = ''

    if (typeof owner === 'object') {
        if ('AddressOwner' in owner) {
            ownerAddress = owner.AddressOwner
        }
        if ('ObjectOwner' in owner) {
            ownerAddress = owner.ObjectOwner
        }
    }
    return ownerAddress
}

const ArtNftParser: SuiObjectParser<ArtNftRpcResponse, ArtNft> = {
    parser: (data, suiData, _) => {
        if (typeof _.details === 'object' && 'data' in _.details) {
            const { owner } = _.details

            const matches = (suiData.data as SuiMoveObject).type.match(ArtNftRegex)
            if (!matches) {
                return undefined
            }
            const packageObjectId = matches[1]
            const packageModule = matches[2]
            const packageModuleClassName = matches[3]
            const nftType = matches?.[4] as NftType
            return {
                name: data.data.fields.name,
                collectionId: data.data.fields.collection_id,
                /*
                attributes: (data.data.fields.attributes.fields.keys ?? []).reduce((acc, key, index) => {
                    acc[key] = data.data.fields.attributes.fields.values[index]
                    return acc
                }, {} as { [c: string]: string }),
                */
                attributes: {},
                url: data.data.fields.url,
                owner,
                ownerAddress: parseObjectOwner(owner as any),
                type: suiData.data.dataType,
                id: _.details.reference.objectId,
                packageObjectId,
                packageModule,
                packageModuleClassName,
                nftType,
                rawResponse: _,
            }
        }
        return undefined
    },
    regex: ArtNftRegex,
}

const CollectionParser: SuiObjectParser<NftCollectionRpcResponse, NftCollection> = {
    parser: (data, suiData, _) => {
        if (typeof _.details === 'object' && 'data' in _.details) {
            const matches = (suiData.data as SuiMoveObject).type.match(CollectionRegex)
            if (!matches) {
                return undefined
            }
            const packageObjectId = matches[1]
            const packageModule = matches[2]
            const packageModuleClassName = matches[3]

            return {
                name: data.name,
                description: data.description,
                creators: data.creators,
                symbol: data.symbol,
                receiver: data.receiver,
                mintAuthorityId: data.mint_authority,
                type: suiData.data.dataType,
                id: _.details.reference.objectId,
                tags: [],
                rawResponse: _,
                packageObjectId: packageObjectId,
                packageModule: packageModule,
                packageModuleClassName: packageModuleClassName,
            } as NftCollection
        }
        return undefined
    },
    regex: CollectionRegex,
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
    const client = new NftClient(provider as any)
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
    const client = new NftClient(provider as any)
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
