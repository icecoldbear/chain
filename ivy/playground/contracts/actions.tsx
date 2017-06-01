// external imports
import { push } from 'react-router-redux'

// ivy imports
import { getItemMap } from '../assets/selectors';
import { getItem } from '../accounts/selectors';
import { fetch } from '../accounts/actions';
import { CompilerResult, CompiledTemplate } from '../templates/types'
import { makeEmptyTemplate, formatCompilerResult } from '../templates/util'
import {
  setSource,
  updateLockError,
  showLockInputErrors
} from '../templates/actions'
import {
  areInputsValid,
  getCompiledName,
  getSource,
  getContractValue,
  getInputMap,
  getContractArgs
} from '../templates/selectors'

import { getPromisedInputMap } from '../inputs/data'

// internal imports
import {
  areSpendInputsValid,
  getSpendContract,
  getSpendContractId,
  getSelectedClauseIndex,
  getLockActions,
  getRequiredValueAction,
  getUnlockAction,
  getClauseWitnessComponents,
  getClauseMintimes,
  getClauseMaxtimes
} from './selectors';

import {
  client,
  prefixRoute,
  createLockingTx,
  createUnlockingTx
} from '../core'

import {
  Action,
  ControlWithAccount,
  ControlWithReceiver,
  DataWitness,
  KeyId,
  Receiver,
  SignatureWitness,
  SpendUnspentOutput,
  WitnessComponent
} from '../core/types'

export const SHOW_UNLOCK_INPUT_ERRORS = 'contracts/SHOW_UNLOCK_INPUT_ERRORS'

export const showUnlockInputErrors = (result: boolean) => {
  return {
    type: SHOW_UNLOCK_INPUT_ERRORS,
    result
  }
}

export const UPDATE_UNLOCK_ERROR = 'contracts/UPDATE_UNLOCK_ERROR'

export const updateUnlockError = (error?) => {
  return {
    type: UPDATE_UNLOCK_ERROR,
    error
  }
}

export const UPDATE_IS_CALLING = 'contracts/UPDATE_IS_CALLING'

export const updateIsCalling = (isCalling: boolean) => {
  const type = UPDATE_IS_CALLING
  return { type, isCalling }
}

export const CREATE_CONTRACT = 'contracts/CREATE_CONTRACT'

export const create = () => {
  return (dispatch, getState) => {
    dispatch(updateIsCalling(true))
    const state = getState()
    if (!areInputsValid(state)) {
      dispatch(updateIsCalling(false))
      dispatch(showLockInputErrors(true))
      return dispatch(updateLockError('One or more arguments to the contract are invalid.'))
    }

    const inputMap = getInputMap(state)
    if (inputMap === undefined) throw "create should not have been called when inputMap is undefined"

    const name = getCompiledName(state)
    const source = getSource(state)
    const spendFromAccount = getContractValue(state)
    if (spendFromAccount === undefined) throw "spendFromAccount should not be undefined here"
    const assetId = spendFromAccount.assetId
    const amount = spendFromAccount.amount
    const promisedInputMap = getPromisedInputMap(inputMap)
    const promisedTemplate = promisedInputMap.then((inputMap) => {
      const args = getContractArgs(state, inputMap).map(param => {
        if (param instanceof Buffer) {
          return { "string": param.toString('hex') }
        }

        if (typeof param === 'string') {
          return { "string": param }
        }

        if (typeof param === 'number') {
          return { "integer": param }
        }

        if (typeof param === 'boolean') {
          return { 'boolean': param }
        }
        throw 'unsupported argument type ' + (typeof param)
      })

      const argMap = { [name]: args }
      return client.ivy.compile({ source, argMap })
    })

    const promisedUtxo = promisedTemplate.then(result => {
      const receiver: Receiver = {
        controlProgram: result.programMap[name],
        expiresAt: "2017-06-25T00:00:00.000Z" // TODO
      }
      const controlWithReceiver: ControlWithReceiver = {
        type: "controlWithReceiver",
        receiver,
        assetId,
        amount
      }
      const actions: Action[] = [spendFromAccount, controlWithReceiver]
      return createLockingTx(actions)
    })

    Promise.all([promisedInputMap, promisedTemplate, promisedUtxo]).then(([inputMap, result, utxo]) => {
      if (result.error) {
        return makeEmptyTemplate(source, result.error)
      }

      const formatted: CompilerResult = formatCompilerResult(result)
      const template: CompiledTemplate = ({
        ...formatted.contracts[formatted.contracts.length-1],
        source,
        error: ''
      } as CompiledTemplate)
      dispatch({
        type: CREATE_CONTRACT,
        controlProgram: result.programMap[name],
        source,
        template,
        inputMap,
        utxo
      })
      dispatch(fetch())
      dispatch(setSource(source))
      dispatch(updateIsCalling(false))
      dispatch(showLockInputErrors(false))
      dispatch(push(prefixRoute('/unlock')))
    }).catch(err => {
      console.log(err)
      dispatch(updateIsCalling(false))
      dispatch(updateLockError(err))
      dispatch(showLockInputErrors(true))
    })
  }
}

export const SPEND_CONTRACT = "contracts/SPEND_CONTRACT"

export const spend = () => {
  return(dispatch, getState) => {
    dispatch(updateIsCalling(true))
    const state = getState()
    if (!areSpendInputsValid(state)) {
      dispatch(updateIsCalling(false))
      dispatch(showUnlockInputErrors(true))
      return dispatch(updateUnlockError('One or more clause arguments are invalid.'))
    }

    const contract = getSpendContract(state)
    const outputId = contract.outputId
    const lockedValueAction: SpendUnspentOutput = {
      type: "spendUnspentOutput",
      outputId
    }
    const lockActions: Action[] = getLockActions(state)
    const actions: Action[] = [lockedValueAction, ...lockActions]

    const reqValueAction = getRequiredValueAction(state)
    if (reqValueAction !== undefined) {
      actions.push(reqValueAction)
    }
    const unlockAction = getUnlockAction(state)
    if (unlockAction !== undefined) {
      actions.push(unlockAction)
    }

    const witness: WitnessComponent[] = getClauseWitnessComponents(getState())
    const mintimes = getClauseMintimes(getState())
    const maxtimes = getClauseMaxtimes(getState())
    createUnlockingTx(actions, witness, mintimes, maxtimes).then((result) => {
      dispatch({
        type: SPEND_CONTRACT,
        id: contract.id,
        unlockTxid: result.id
      })
      dispatch(fetch())
      dispatch(updateIsCalling(false))
      dispatch(showUnlockInputErrors(false))
      dispatch(push(prefixRoute('/unlock')))
    }).catch(err => {
      console.log(err)
      dispatch(updateIsCalling(false))
      dispatch(updateUnlockError(err))
      dispatch(showUnlockInputErrors(true))
    })
  }
}

export const SET_CLAUSE_INDEX = 'contracts/SET_CLAUSE_INDEX'

export const setClauseIndex = (selectedClauseIndex: number) => {
  return {
    type: SET_CLAUSE_INDEX,
    selectedClauseIndex: selectedClauseIndex
  }
}

export const UPDATE_INPUT = 'contracts/UPDATE_INPUT'

export const updateInput = (name: string, newValue: string) => {
  return (dispatch, getState) => {
    dispatch({
      type: UPDATE_INPUT,
      name: name,
      newValue: newValue
    })
    dispatch(updateLockError())
  }
}

export const UPDATE_CLAUSE_INPUT = 'contracts/UPDATE_CLAUSE_INPUT'

export const updateClauseInput = (name: string, newValue: string) => {
  return (dispatch, getState) => {
    const state = getState()
    const contractId = getSpendContractId(state)
    dispatch({
      type: UPDATE_CLAUSE_INPUT,
      contractId: contractId,
      name: name,
      newValue: newValue
    })
    dispatch(updateUnlockError())
  }
}

export const CLOSE_MODAL = 'CLOSE_MODAL'

export const closeModal = () => {
  return {
    type: CLOSE_MODAL
  }
}
