import { describe, it, expect } from 'vitest'
import { buildLocalizationTree } from './localizationTree'
import { compareLocalizationFiles } from './localizationComparator'
import type { ParsedLocalizationFile, JsonValue } from '../types/localization'

describe('localizationTree', () => {
  const createFile = (
    filename: string,
    keys: Record<string, JsonValue>
  ): ParsedLocalizationFile => ({
    filename,
    path: `/locales/${filename}`,
    raw: keys,
    keys,
    keyCount: Object.keys(keys).length,
  })

  it('builds tree for simple keys with multiple leaves under same parent', () => {
    const en = createFile('en.json', { 'AUTH.LOGIN': 'Login', 'AUTH.LOGOUT': 'Logout' })
    const ru = createFile('ru.json', { 'AUTH.LOGIN': 'Войти', 'AUTH.LOGOUT': 'Выйти' })
    const comp = compareLocalizationFiles([en, ru])

    const tree = buildLocalizationTree('en.json', comp, en)

    expect(tree.filename).toBe('en.json')
    expect(tree.totalKeys).toBe(2)
    expect(tree.presentKeysCount).toBe(2)
    expect(tree.missingKeysCount).toBe(0)
    expect(tree.emptyKeysCount).toBe(0)
    expect(tree.rootNodes.length).toBe(1)

    const authNode = tree.rootNodes[0]
    expect(authNode.segment).toBe('AUTH')
    expect(authNode.type).toBe('folder')
    expect(authNode.children.length).toBe(2)

    expect(authNode.children[0].segment).toBe('LOGIN')
    expect(authNode.children[0].fullKey).toBe('AUTH.LOGIN')
    expect(authNode.children[0].type).toBe('leaf')
    expect(authNode.children[0].isPresent).toBe(true)
    expect(authNode.children[0].isEmpty).toBe(false)
    expect(authNode.children[0].value).toBe('Login')

    expect(authNode.children[1].segment).toBe('LOGOUT')
    expect(authNode.children[1].fullKey).toBe('AUTH.LOGOUT')
    expect(authNode.children[1].type).toBe('leaf')
  })

  it('correctly flags empty string values as isEmpty: true', () => {
    const en = createFile('en.json', {
      'MENU.PLAY': 'Play',
      'MENU.EXIT': 'Exit',
    })
    const ru = createFile('ru.json', {
      'MENU.PLAY': '', // Empty string
      'MENU.EXIT': 'Выход',
    })
    const comp = compareLocalizationFiles([en, ru])

    const treeRu = buildLocalizationTree('ru.json', comp, ru)

    expect(treeRu.presentKeysCount).toBe(2)
    expect(treeRu.missingKeysCount).toBe(0)
    expect(treeRu.emptyKeysCount).toBe(1)

    const menu = treeRu.rootNodes[0]
    const playNode = menu.children.find((c) => c.segment === 'PLAY')!
    expect(playNode.isPresent).toBe(true)
    expect(playNode.isMissing).toBe(false)
    expect(playNode.isEmpty).toBe(true)
    expect(playNode.value).toBe('')

    const exitNode = menu.children.find((c) => c.segment === 'EXIT')!
    expect(exitNode.isPresent).toBe(true)
    expect(exitNode.isMissing).toBe(false)
    expect(exitNode.isEmpty).toBe(false)
    expect(exitNode.value).toBe('Выход')
  })

  it('constructs correct hierarchy for deeply nested keys', () => {
    const en = createFile('en.json', { 'ADMIN.PANEL.BUTTON.SAVE': 'Save' })
    const ru = createFile('ru.json', { 'ADMIN.PANEL.BUTTON.SAVE': 'Сохранить' })
    const comp = compareLocalizationFiles([en, ru])

    const tree = buildLocalizationTree('en.json', comp, en)

    expect(tree.rootNodes.length).toBe(1)
    const admin = tree.rootNodes[0]
    expect(admin.segment).toBe('ADMIN')

    const panel = admin.children[0]
    expect(panel.segment).toBe('PANEL')

    const button = panel.children[0]
    expect(button.segment).toBe('BUTTON')

    const save = button.children[0]
    expect(save.segment).toBe('SAVE')
    expect(save.fullKey).toBe('ADMIN.PANEL.BUTTON.SAVE')
    expect(save.type).toBe('leaf')
    expect(save.value).toBe('Save')
  })

  it('creates separate branches for different top-level namespaces', () => {
    const en = createFile('en.json', {
      'AUTH.LOGIN': 'Login',
      'AUTH.LOGOUT': 'Logout',
      'ADMIN.TITLE': 'Admin',
    })
    const ru = createFile('ru.json', {
      'AUTH.LOGIN': 'Войти',
      'ADMIN.TITLE': 'Админ',
    })
    const comp = compareLocalizationFiles([en, ru])

    const treeRu = buildLocalizationTree('ru.json', comp, ru)

    expect(treeRu.rootNodes.length).toBe(2)
    expect(treeRu.rootNodes.map((n) => n.segment)).toEqual(['ADMIN', 'AUTH'])

    const auth = treeRu.rootNodes.find((n) => n.segment === 'AUTH')!
    const login = auth.children.find((c) => c.segment === 'LOGIN')!
    const logout = auth.children.find((c) => c.segment === 'LOGOUT')!

    expect(login.isPresent).toBe(true)
    expect(login.isMissing).toBe(false)
    expect(login.value).toBe('Войти')

    expect(logout.isPresent).toBe(false)
    expect(logout.isMissing).toBe(true)
    expect(logout.value).toBeUndefined()
    expect(logout.missingInFiles).toContain('ru.json')
  })

  it('detects structural conflict when a parent is a primitive in one file and an object in another', () => {
    const en = createFile('en.json', { 'A.B.C': 'Deep value' })
    const ru = createFile('ru.json', { 'A.B': 'Primitive value' })
    const comp = compareLocalizationFiles([en, ru])

    const treeRu = buildLocalizationTree('ru.json', comp, ru)

    const aNode = treeRu.rootNodes[0]
    const bNode = aNode.children[0]

    expect(bNode.isConflict).toBe(true)
    expect(bNode.type).toBe('conflict')
    expect(bNode.value).toBe('Primitive value')
  })

  it('sorts nodes alphabetically at every level', () => {
    const en = createFile('en.json', {
      'Z.B': '1',
      'Z.A': '2',
      'A.D': '3',
      'A.C': '4',
    })
    const comp = compareLocalizationFiles([en, en])

    const tree = buildLocalizationTree('en.json', comp, en)

    expect(tree.rootNodes.map((n) => n.segment)).toEqual(['A', 'Z'])
    expect(tree.rootNodes[0].children.map((c) => c.segment)).toEqual(['C', 'D'])
    expect(tree.rootNodes[1].children.map((c) => c.segment)).toEqual(['A', 'B'])
  })

  it('does not mutate input comparisonResult or parsed files', () => {
    const en = createFile('en.json', { A: '1' })
    const ru = createFile('ru.json', { A: '2' })
    const comp = compareLocalizationFiles([en, ru])

    const compClone = JSON.parse(JSON.stringify(comp))
    const enClone = JSON.parse(JSON.stringify(en))

    buildLocalizationTree('en.json', comp, en)

    expect(comp).toEqual(compClone)
    expect(en).toEqual(enClone)
  })
})
