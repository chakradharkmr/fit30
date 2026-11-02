import { handleAccountState } from '../lib/account.mjs';

export default async (request) => handleAccountState(request, { env: process.env, fetch });
