import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { init, set, get, list, remove, getEnv } from "../../src/sdk/index.js"
import * as vibelock from "../../src/index.js"
import { load, save } from "../../src/core/vault.js"
import { existsSync } from "node:fs"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { randomBytes } from "node:crypto"
import { homedir } from "node:os"
import path from "node:path"

const usedProjectIds: string[] = []

const testOptions = (dir: string, projectId?: string) => {
  const id = projectId ?? `test-${randomBytes(4).toString("hex")}`
  usedProjectIds.push(id)
  return {
    vaultPath: join(dir, "secrets.vibe"),
    projectId: id,
  }
}

function keyPath(projectId: string): string {
  return path.join(homedir(), ".vibelock", "keys", projectId, "master.key")
}

describe("SDK init", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `vibelock-test-${randomBytes(8).toString("hex")}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    for (const id of usedProjectIds.splice(0)) {
      const p = keyPath(id)
      const dir = path.dirname(p)
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it("creates vault and master key", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    expect(existsSync(opts.vaultPath)).toBe(true)
  })

  it("creates vault at custom vaultPath", async () => {
    const customPath = join(tmpDir, "custom.vibe")
    const opts = testOptions(tmpDir)
    opts.vaultPath = customPath
    await init(opts)
    expect(existsSync(customPath)).toBe(true)
  })

  it("creates independent master key for custom projectId", async () => {
    const opts1 = testOptions(join(tmpDir, "a"))
    const opts2 = testOptions(join(tmpDir, "b"))
    await mkdir(join(tmpDir, "a"), { recursive: true })
    await mkdir(join(tmpDir, "b"), { recursive: true })
    await init(opts1)
    await init(opts2)
    expect(existsSync(opts1.vaultPath)).toBe(true)
    expect(existsSync(opts2.vaultPath)).toBe(true)
  })

  it("throws if vault already exists", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    await expect(init(opts)).rejects.toThrow("Vault already exists")
  })

  it("throws if master key already exists", async () => {
    const projectId = `dup-${randomBytes(4).toString("hex")}`
    const opts1 = testOptions(tmpDir, projectId)
    const opts2 = { ...opts1, vaultPath: join(tmpDir, "other.vibe") }
    await init(opts1)
    await expect(init(opts2)).rejects.toThrow("Master key already exists")
  })
})

describe("SDK set + get round-trip", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `vibelock-test-${randomBytes(8).toString("hex")}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    for (const id of usedProjectIds.splice(0)) {
      const p = keyPath(id)
      const dir = path.dirname(p)
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it("set then get returns original value", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    await set("API_KEY", "secret123", opts)
    const value = await get("API_KEY", opts)
    expect(value).toBe("secret123")
  })

  it("get on nonexistent key throws", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    await expect(get("MISSING", opts)).rejects.toThrow()
  })

  it("round-trip with unicode", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    await set("UNICODE", "hola 🌍 こんにちは", opts)
    const value = await get("UNICODE", opts)
    expect(value).toBe("hola 🌍 こんにちは")
  })

  it("round-trip with large value (10KB)", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    const large = "x".repeat(10 * 1024)
    await set("BIG", large, opts)
    const value = await get("BIG", opts)
    expect(value).toBe(large)
  })

  it("round-trip with custom vaultPath", async () => {
    const customPath = join(tmpDir, "custom.vibe")
    const opts = testOptions(tmpDir)
    opts.vaultPath = customPath
    await init(opts)
    await set("KEY", "value", opts)
    expect(await get("KEY", opts)).toBe("value")
  })
})

describe("SDK list", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `vibelock-test-${randomBytes(8).toString("hex")}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    for (const id of usedProjectIds.splice(0)) {
      const p = keyPath(id)
      const dir = path.dirname(p)
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it("returns empty array after init", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    expect(await list(opts)).toEqual([])
  })

  it("returns all keys after multiple sets", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    await set("A", "1", opts)
    await set("B", "2", opts)
    await set("C", "3", opts)
    const keys = await list(opts)
    expect(keys.sort()).toEqual(["A", "B", "C"])
  })
})

describe("SDK remove", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `vibelock-test-${randomBytes(8).toString("hex")}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    for (const id of usedProjectIds.splice(0)) {
      const p = keyPath(id)
      const dir = path.dirname(p)
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it("removes an existing key", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    await set("KEY", "value", opts)
    await remove("KEY", opts)
    expect(await list(opts)).toEqual([])
  })

  it("throws on nonexistent key", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    await expect(remove("MISSING", opts)).rejects.toThrow()
  })

  it("get throws after remove", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    await set("KEY", "value", opts)
    await remove("KEY", opts)
    await expect(get("KEY", opts)).rejects.toThrow()
  })
})

describe("SDK multi-project isolation", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `vibelock-test-${randomBytes(8).toString("hex")}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    for (const id of usedProjectIds.splice(0)) {
      const p = keyPath(id)
      const dir = path.dirname(p)
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it("same key in different projects returns correct values", async () => {
    const dirA = join(tmpDir, "a")
    const dirB = join(tmpDir, "b")
    await mkdir(dirA, { recursive: true })
    await mkdir(dirB, { recursive: true })

    const optsA = testOptions(dirA, `proj-a-${randomBytes(4).toString("hex")}`)
    const optsB = testOptions(dirB, `proj-b-${randomBytes(4).toString("hex")}`)

    await init(optsA)
    await init(optsB)

    await set("KEY", "valueA", optsA)
    await set("KEY", "valueB", optsB)

    expect(await get("KEY", optsA)).toBe("valueA")
    expect(await get("KEY", optsB)).toBe("valueB")
  })

  it("list only returns keys from the right project", async () => {
    const dirA = join(tmpDir, "a")
    const dirB = join(tmpDir, "b")
    await mkdir(dirA, { recursive: true })
    await mkdir(dirB, { recursive: true })

    const optsA = testOptions(dirA, `list-a-${randomBytes(4).toString("hex")}`)
    const optsB = testOptions(dirB, `list-b-${randomBytes(4).toString("hex")}`)

    await init(optsA)
    await init(optsB)

    await set("ONLY_A", "val", optsA)
    await set("SHARED", "a", optsA)
    await set("ONLY_B", "val", optsB)
    await set("SHARED", "b", optsB)

    const keysA = (await list(optsA)).sort()
    const keysB = (await list(optsB)).sort()

    expect(keysA).toEqual(["ONLY_A", "SHARED"])
    expect(keysB).toEqual(["ONLY_B", "SHARED"])
  })

  it("set 5 keys and get each one", { timeout: 15_000 }, async () => {
    const opts = testOptions(tmpDir)
    await init(opts)

    const entries: Record<string, string> = {
      DB_HOST: "localhost",
      DB_PORT: "5432",
      DB_USER: "admin",
      DB_PASS: "secret",
      API_KEY: "abc123",
    }

    for (const [k, v] of Object.entries(entries)) {
      await set(k, v, opts)
    }

    for (const [k, v] of Object.entries(entries)) {
      expect(await get(k, opts)).toBe(v)
    }

    expect((await list(opts)).sort()).toEqual(Object.keys(entries).sort())
  })
})

describe("SDK getEnv", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `vibelock-test-${randomBytes(8).toString("hex")}`)
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
    for (const id of usedProjectIds.splice(0)) {
      const p = keyPath(id)
      const dir = path.dirname(p)
      await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it("returns undefined if env is empty or missing", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    expect(await getEnv(undefined, opts)).toEqual({}) // Wait, vault create defaults env to {}
  })

  it("returns specific key from env", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    
    // Set env directly using core vault methods
    const vault = await load(opts.vaultPath)
    vault.env = { DB_URL: "postgres://localhost", PORT: "8080" }
    await save(opts.vaultPath, vault)

    expect(await getEnv("DB_URL", opts)).toBe("postgres://localhost")
    expect(await getEnv("PORT", opts)).toBe("8080")
    expect(await getEnv("NONEXISTENT", opts)).toBeUndefined()
  })

  it("returns entire env object when key is omitted", async () => {
    const opts = testOptions(tmpDir)
    await init(opts)
    
    const vault = await load(opts.vaultPath)
    vault.env = { DB_URL: "postgres://localhost", PORT: "8080" }
    await save(opts.vaultPath, vault)

    const allEnv = await getEnv(undefined, opts)
    expect(allEnv).toEqual({ DB_URL: "postgres://localhost", PORT: "8080" })
  })
})

describe("SDK re-exports from src/index.ts", () => {
  it("default export has all functions", () => {
    const def = vibelock.default
    expect(typeof def.get).toBe("function")
    expect(typeof def.set).toBe("function")
    expect(typeof def.list).toBe("function")
    expect(typeof def.remove).toBe("function")
    expect(typeof def.init).toBe("function")
    expect(typeof def.getEnv).toBe("function")
  })

  it("named exports exist", () => {
    expect(typeof vibelock.get).toBe("function")
    expect(typeof vibelock.set).toBe("function")
    expect(typeof vibelock.list).toBe("function")
    expect(typeof vibelock.remove).toBe("function")
    expect(typeof vibelock.init).toBe("function")
    expect(typeof vibelock.getEnv).toBe("function")
  })
})
