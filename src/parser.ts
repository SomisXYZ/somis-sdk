import { ObjectOwner, SuiMoveObject } from '@mysten/sui.js'
import {
    ArtNft,
    ArtNftRpcResponse,
    NftCollection,
    NftCollectionRpcResponse,
    NftType,
    SuiObjectParser,
} from '@originbyte/js-sdk'

// eslint-disable-next-line max-len
const ArtNftRegex =
    /(0x[a-f0-9]{40})::nft::Nft<0x[a-f0-9]{40}::([a-zA-Z_]{1,})::([a-zA-Z_]{1,}), 0x[a-f0-9]{40}::([a-zA-Z_]{1,}::[a-zA-Z_]{1,})>/

// eslint-disable-next-line max-len
const CollectionRegex =
    /(0x[a-f0-9]{40})::collection::Collection<0x[a-f0-9]{40}::([a-zA-Z_]{1,})::([a-zA-Z_]{1,}), 0x[a-f0-9]{40}::std_collection::StdMeta>/

export const parseObjectOwner = (owner: ObjectOwner) => {
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

export const ArtNftParser: SuiObjectParser<ArtNftRpcResponse, ArtNft> = {
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

export const CollectionParser: SuiObjectParser<NftCollectionRpcResponse, NftCollection> = {
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
