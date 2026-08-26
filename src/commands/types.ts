/**
 * Copyright (c) 2026 Krishnaswamy Subramanian
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// src/commands/types.ts
import { Command } from 'commander'
import { resolveSpace } from './_space.ts'
import { fetchStructures } from './search.ts'
import { handleApiError, CapacitiesError, ExitCode } from '../errors.ts'
import { printTable, printJson, printLine, type CommandOptions } from '../output.ts'

type PropDef = { name: string; type: string; labelSet?: { name: string }[] }
type FullStructure = { id: string; title: string; propertyDefinitions?: PropDef[] }

export async function runTypes(
  name: string | undefined,
  nameFlag: string | undefined,
  opts: CommandOptions
): Promise<void> {
  const space = await resolveSpace(opts.space)
  // cast: fetchStructures types StructureItem as {id,title} but cache holds full payload
  const { structures } = (await fetchStructures(space)) as { structures: FullStructure[] }

  // --name flag: bare structureId for shell substitution
  if (nameFlag) {
    const found = structures.find((s) => s.title === nameFlag)
    if (!found) throw new CapacitiesError(ExitCode.NOT_FOUND, `Unknown type "${nameFlag}"`)
    if (opts.json) {
      printJson({ name: found.title, structureId: found.id }, opts)
      return
    }
    printLine(found.id, opts)
    return
  }

  // positional name: detail view (structureId header + field table)
  if (name) {
    const found = structures.find((s) => s.title === name)
    if (!found) throw new CapacitiesError(ExitCode.NOT_FOUND, `Unknown type "${name}"`)
    const propDefs: PropDef[] = found.propertyDefinitions ?? []
    const fields = propDefs.map((p) => ({
      name: p.name || p.type,
      type: p.type,
      values: p.labelSet ? p.labelSet.map((l) => l.name) : [],
    }))
    if (opts.json) {
      printJson({ name: found.title, structureId: found.id, fields }, opts)
      return
    }
    printLine(`${found.title}  (${found.id})`, opts)
    printLine('', opts)
    const rows = propDefs.map((p) => ({
      field: p.name || p.type,
      type: p.type,
      values: p.labelSet ? p.labelSet.map((l) => l.name).join(', ') : '',
    }))
    printTable(rows, opts)
    return
  }

  // no name: list all types
  const rows = structures.map((s) => ({ name: s.title, structureId: s.id }))
  if (opts.json) {
    printJson(rows, opts)
    return
  }
  printTable(rows, opts)
}

export function registerTypes(program: Command): void {
  program
    .command('types [name]')
    .description('List object types and their fields')
    .option('-n, --name <type>', 'print bare structureId for a single type (shell-friendly)')
    .action(async (name: string | undefined, cmdOpts: { name?: string }) => {
      const globalOpts = program.opts() as CommandOptions
      await runTypes(name, cmdOpts.name, globalOpts).catch(handleApiError)
    })
}
