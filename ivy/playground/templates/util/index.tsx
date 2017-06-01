import { CompilerResult, CompiledTemplate } from '../types'

export const makeEmptyTemplate = (source: string, error: string): CompiledTemplate => {
  return {
    name: '',
    params: [],
    clauses: [],
    value: '',
    bodyBytecode: '',
    bodyOpcodes: '',
    recursive: false,
    source,
    error
  }
}

export const formatCompilerResult = (result: CompilerResult): CompilerResult => ({
  ...result,
  contracts: result.contracts.map(orig => {
    const contract = {
      ...orig,
      params: orig.params || [],
      clauses: orig.clauses || []
    } as CompiledTemplate

    const clauses = contract.clauses.map(clause => ({
      ...clause,
      params: clause.params || [],
      reqs: clause.reqs || [],
      mintimes: clause.mintimes || [],
      maxtimes: clause.maxtimes || [],
      values: clause.values || [],
      hashCalls: clause.hashCalls || []
    }))

    return ({
      ...contract,
      clauses
    } as CompiledTemplate)
  })
})
