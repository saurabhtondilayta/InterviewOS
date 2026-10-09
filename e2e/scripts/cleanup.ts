import { env } from '../lib/env'
import { deleteTestUser } from '../lib/testUser'

const deleted = await deleteTestUser()
console.log(deleted ? `Deleted test account ${env.email} and all of its data.` : `No test account ${env.email} found.`)
