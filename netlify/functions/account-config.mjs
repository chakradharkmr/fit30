import { handleAccountConfig } from '../lib/account.mjs';

export default async (request) => handleAccountConfig(request, { env: process.env });
