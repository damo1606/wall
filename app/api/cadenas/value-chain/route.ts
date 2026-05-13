import { analyzeValueChain, createCadenasHandler } from '@/lib/cadenas'

export const POST = createCadenasHandler(analyzeValueChain)
