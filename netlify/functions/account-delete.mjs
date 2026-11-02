import { handleAccountDelete } from '../lib/account.mjs';

export default async (request) => handleAccountDelete(request, { env: process.env, fetch });
