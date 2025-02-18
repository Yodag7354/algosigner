import { WalletMultisigMetadata } from '@algosigner/common/types';
import { Validate, ValidationResponse, ValidationStatus } from '../utils/validator';
import { logging } from '@algosigner/common/logging';
import { InvalidTransactionStructure } from '../../errors/validation';

type AssetInfo = {
  unitName: string;
  displayAmount: string;
};

//
// Base validated transaction wrap
///
export class BaseValidatedTxnWrap {
  transaction: any = undefined;
  validityObject: object = {};
  txDerivedTypeText: string;
  estimatedFee: number;
  assetInfo: AssetInfo;
  msigData: WalletMultisigMetadata;
  signers: Array<string>;

  constructor(
    params: any,
    txnType: any,
    v1Validations: boolean = true,
    requiredParamsSet: Array<string> = undefined
  ) {
    this.transaction = new txnType();
    const missingFields = [];
    const extraFields = [];

    // Cycle base transaction fields for this type of transaction to verify require fields are present.
    // Nullable type fields are being initialized to null instead of undefined.
    Object.entries(this.transaction).forEach(([key, value]) => {
      if (value === undefined && (params[key] === undefined || params[key] === null)) {
        missingFields.push(key);
      }
    });

    // Check required values in the case where one of a set is required.
    if (requiredParamsSet && requiredParamsSet.length > 0) {
      const foundRequiredParams = [];
      requiredParamsSet.forEach((key) => {
        if (params[key] !== undefined && params[key] !== null) {
          foundRequiredParams.push(key);
        }
      });
      const missingRequiredParams = requiredParamsSet.filter(
        (p) => !foundRequiredParams.includes(p)
      );
      missingFields.concat(missingRequiredParams);
    }

    // Throwing error here so that missing fields can be combined.
    if (missingFields.length > 0) {
      throw new InvalidTransactionStructure(
        `Creation of ${
          txnType.name
        } has missing or invalid required properties: ${missingFields.toString()}.`
      );
    }

    // Check the properties included versus the interface. Reject transactions with unknown fields.
    for (const prop in params) {
      if (!Object.keys(this.transaction).includes(prop)) {
        extraFields.push(prop);
      } else {
        try {
          this.transaction[prop] = params[prop];
          if (
            (prop === 'group' || prop === 'appApprovalProgram' || prop === 'appClearProgram') &&
            !v1Validations
          ) {
            this.transaction[prop] = Buffer.from(params[prop]).toString('base64');
          } else if (prop === 'appArgs' && !v1Validations) {
            this.transaction[prop] = this.transaction[prop].map((arg) =>
              Buffer.from(arg).toString('base64')
            );
          } else if (prop === 'note') {
            this.transaction[prop] = Buffer.from(params[prop]).toString();
          }
          this.validityObject[prop] = Validate(prop, this.transaction[prop]) as ValidationResponse;
        } catch (e) {
          logging.log(e);
          throw new Error(`Transaction has encountered an unknown error while processing.`);
        }
      }
    }

    // Throwing error here so that extra fields can be combined.
    if (extraFields.length > 0) {
      throw new InvalidTransactionStructure(
        `Creation of ${txnType.name} has extra or invalid fields: ${extraFields.toString()}.`
      );
    }

    // If we don't have a flatFee or it is falsy and we have a non-zero fee, create a warning.
    if (v1Validations && !params['flatFee'] && params['fee'] && params['fee'] > 0) {
      this.validityObject['flatFee'] = new ValidationResponse({
        status: ValidationStatus.Warning,
        info: 'The fee is subject to change without flatFee enabled.',
      });
    }
  }
}
