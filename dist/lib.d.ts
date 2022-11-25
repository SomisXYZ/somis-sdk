import { SignableTransaction, SuiTransactionResponse, JsonRpcProvider } from '@mysten/sui.js';
export * from '@mysten/sui.js';
import { NftClient, NftCollection, ArtNft } from '@originbyte/js-sdk';
export * from '@originbyte/js-sdk';
import DataLoader from 'dataloader';

interface Wallet {
    signAndExecuteTransaction(transaction: SignableTransaction): Promise<SuiTransactionResponse>;
}
declare class SuiNftService {
    private readonly provider;
    nftClient: NftClient;
    collectionDataLoader: DataLoader<string, NftCollection | null>;
    nftDataLoader: DataLoader<string, ArtNft | null>;
    constructor(provider: JsonRpcProvider);
    getNFTByOwner(address: string): Promise<ArtNft[]>;
    getNFTById(nftId: string, reload?: boolean): Promise<ArtNft | null>;
    isNftListed(nftId: string, marketplaceId: string): Promise<boolean>;
    getNFTByIds(nftIds: string[]): Promise<(ArtNft | null)[]>;
    getNFTCollection(collectionId: string): Promise<NftCollection | null>;
    buyFromLaunchpad(wallet: Wallet, options: {
        launchpadId: string;
        buyer: string;
    }): Promise<void>;
    claimCertificate(wallet: Wallet, address: string, packageObjectId: string): Promise<void>;
    listNFT(packageObjectId: string, marketplaceId: string, item: ArtNft, price: string, wallet: Wallet): Promise<string | undefined>;
    buyNFT(packageObjectId: string, marketplace: string, listingKey: string, price: string, wallet: Wallet, buyerAddress: string): Promise<void>;
    cancelListing(packageObjectId: string, marketplace: string, listingKey: string, wallet: Wallet): Promise<void>;
}

export { SuiNftService, Wallet };
