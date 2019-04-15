import { store } from "../App";
// import * as ethers from "ethers";
const bip39 = require("bip39");
const hdkey = require("ethereumjs-wallet/hdkey");
const CryptoJS = require("crypto-js");

export async function generateMnemonic() {
  const mnemonic = bip39.generateMnemonic();
  return mnemonic;
}

export async function getWalletFromEncryptedMnemonic(encryptedMnemonic, secret) {
  let wallet;
  try {
    const mnemonic = decryptMnemonic(encryptedMnemonic, secret);
    const seed = bip39.mnemonicToSeed(mnemonic);
    wallet = await hdkey
      .fromMasterSeed(seed)
      .derivePath("m/44'/60'/0'/0/0")
      .getWallet();

    // set in case this is first call
    localStorage.setItem("delegateSigner", wallet.getAddressString());
    localStorage.setItem("encryptedMnemonic", encryptedMnemonic)
    // update refunding variable on import
    localStorage.removeItem("refunding");
    localStorage.removeItem("maxBalanceAfterRefund");
    
    return wallet;
  } catch (e) {
    console.log(`error in WalletGen`);
    console.log(e);
  }
}

export function decryptMnemonic(encryptedMnemonic, secret) {
  const bytes  = CryptoJS.AES.decrypt(encryptedMnemonic, secret);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function encryptMnemonic(mnemonic, secret) {
  return CryptoJS.AES.encrypt(mnemonic, secret).toString();
}

export function getStore() {
  if (store) {
    return store;
  } else {
    console.log("no store found");
  }
}
