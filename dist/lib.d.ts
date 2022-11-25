import { SignableTransaction, SuiTransactionResponse, JsonRpcProvider } from '@mysten/sui.js';
export * from '@mysten/sui.js';
import { ArtNft, NftCollection } from '@originbyte/js-sdk';
export * from '@originbyte/js-sdk';
import DataLoader from 'dataloader';

interface Wallet {
    signAndExecuteTransaction(transaction: SignableTransaction): Promise<SuiTransactionResponse>;
}
declare function getNFTByOwner(address: string): Promise<ArtNft[]>;
declare function getNFTById(nftId: string): Promise<ArtNft | null>;
declare function getNFTCollection(collectionId: string): Promise<NftCollection | null>;
declare const collectionDataLoader: DataLoader<string, NftCollection, string>;
declare const nftDataLoader: DataLoader<string, ArtNft, string>;
declare function buyFromLaunchpad(provider: JsonRpcProvider, wallet: Wallet, options: {
    launchpadId: string;
    buyer: string;
}): Promise<void>;
declare function claimCertificate(provider: JsonRpcProvider, wallet: Wallet, address: string, packageObjectId: string): Promise<void>;
declare function listNFT(packageObjectId: string, marketplaceId: string, item: ArtNft, price: string, wallet: Wallet): Promise<string | undefined>;
declare function cancelNFT(packageObjectId: string, marketplace: string, listingKey: string, wallet: Wallet): Promise<void>;
declare function buyNFT(provider: JsonRpcProvider, packageObjectId: string, marketplace: string, listingKey: string, price: string, wallet: Wallet, buyerAddress: string): Promise<void>;

export { Wallet, buyFromLaunchpad, buyNFT, cancelNFT, claimCertificate, collectionDataLoader, getNFTById, getNFTByOwner, getNFTCollection, listNFT, nftDataLoader };
