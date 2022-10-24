import { JsonRpcProvider } from '@mysten/sui.js'

async function run() {
    const provider = new JsonRpcProvider('https://fullnode.devnet.sui.io:443')
    const object = await provider.getObjectsOwnedByAddress('0x9db6a28b950590baa63509de3603ef7a2ced0a3c')
    console.log(object)
}

run()
