import z from "zod"
import * as path from "path"
import * as fs from "fs"
import { createTwoFilesPatch, diffLines } from "diff"
import { ToolDef, ExecuteResult, ToolContext } from "./types.js"
import { parsePatch, deriveNewContentsFromChunks, applyHunksToFiles, Hunk } from "./patch.js"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDescription() {
  try {
    return fs.readFileSync(path.join(__dirname, "apply_patch.txt"), "utf8");
  } catch (e) {
    return "Use the apply_patch tool to edit files.";
  }
}

const PatchParams = z.object({
  patchText: z.string().describe("The full patch text that describes all changes to be made"),
})

export const ApplyPatchTool: ToolDef<typeof PatchParams> = {
  id: "apply_patch",
  description: loadDescription(),
  parameters: PatchParams,
  async execute(params: z.infer<typeof PatchParams>, ctx: ToolContext): Promise<ExecuteResult> {
    if (!params.patchText) {
      throw new Error("patchText is required")
    }

    let hunks: Hunk[]
    try {
      const parseResult = parsePatch(params.patchText)
      hunks = parseResult.hunks
    } catch (error) {
      throw new Error(`apply_patch verification failed: ${error}`)
    }

    if (hunks.length === 0) {
      const normalized = params.patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
      if (normalized === "*** Begin Patch\n*** End Patch") {
        throw new Error("patch rejected: empty patch")
      }
      throw new Error("apply_patch verification failed: no hunks found")
    }

    const fileChanges: Array<{
      filePath: string
      oldContent: string
      newContent: string
      type: "add" | "update" | "delete" | "move"
      movePath?: string
      diff: string
      additions: number
      deletions: number
    }> = []

    let totalDiff = ""

    for (const hunk of hunks) {
      const filePath = path.resolve(process.cwd(), hunk.path)

      switch (hunk.type) {
        case "add": {
          const oldContent = ""
          const newContent =
            hunk.contents.length === 0 || hunk.contents.endsWith("\n") ? hunk.contents : `${hunk.contents}\n`
          const diff = createTwoFilesPatch(filePath, filePath, oldContent, newContent)

          let additions = 0
          let deletions = 0
          for (const change of diffLines(oldContent, newContent)) {
            if (change.added) additions += change.count || 0
            if (change.removed) deletions += change.count || 0
          }

          fileChanges.push({
            filePath,
            oldContent,
            newContent,
            type: "add",
            diff,
            additions,
            deletions,
          })

          totalDiff += diff + "\n"
          break
        }

        case "update": {
          try {
            const { content: newContent, unified_diff: diff } = deriveNewContentsFromChunks(filePath, hunk.chunks)
            
            const oldContent = fs.readFileSync(filePath, 'utf8')

            let additions = 0
            let deletions = 0
            for (const change of diffLines(oldContent, newContent)) {
              if (change.added) additions += change.count || 0
              if (change.removed) deletions += change.count || 0
            }

            const movePath = hunk.move_path ? path.resolve(process.cwd(), hunk.move_path) : undefined

            fileChanges.push({
              filePath,
              oldContent,
              newContent,
              type: hunk.move_path ? "move" : "update",
              movePath,
              diff,
              additions,
              deletions,
            })

            totalDiff += diff + "\n"
          } catch (error) {
            throw new Error(`apply_patch verification failed: ${error}`)
          }
          break
        }

        case "delete": {
          try {
            const oldContent = fs.readFileSync(filePath, 'utf8')
            const diff = createTwoFilesPatch(filePath, filePath, oldContent, "")
            const deletions = oldContent.split("\n").length

            fileChanges.push({
              filePath,
              oldContent,
              newContent: "",
              type: "delete",
              diff,
              additions: 0,
              deletions,
            })

            totalDiff += diff + "\n"
          } catch (error) {
            throw new Error(`apply_patch verification failed: ${error}`)
          }
          break
        }
      }
    }

    await applyHunksToFiles(hunks)

    const summaryLines = fileChanges.map((change) => {
      const relPath = path.relative(process.cwd(), change.filePath).replaceAll("\\", "/")
      if (change.type === "add") {
        return `A ${relPath}`
      }
      if (change.type === "delete") {
        return `D ${relPath}`
      }
      const targetRelPath = change.movePath 
        ? path.relative(process.cwd(), change.movePath).replaceAll("\\", "/")
        : relPath
      return `M ${targetRelPath}`
    })

    const output = `Success. Updated the following files:\n${summaryLines.join("\n")}`

    return {
      title: output,
      metadata: {
        diff: totalDiff,
        files: fileChanges.map(c => ({
          filePath: c.filePath,
          relativePath: path.relative(process.cwd(), c.filePath).replaceAll("\\", "/"),
          type: c.type,
          patch: c.diff,
          additions: c.additions,
          deletions: c.deletions,
          movePath: c.movePath
        })),
      },
      output,
    }
  },
}
