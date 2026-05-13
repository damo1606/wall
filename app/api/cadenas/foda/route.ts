import { analyzeFoda, createCadenasHandler } from '@/lib/cadenas'

export const POST = createCadenasHandler(analyzeFoda)
