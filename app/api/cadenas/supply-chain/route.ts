import { analyzeSupplyChain, createCadenasHandler } from '@/lib/cadenas'

export const POST = createCadenasHandler(analyzeSupplyChain)
