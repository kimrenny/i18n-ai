import ts from 'typescript'
import type { FileScopeContext } from './detectors/TypeScriptAstDetector'

export const MAX_RESOLUTION_DEPTH = 6
export const MAX_RESOLVED_VALUES = 40

export interface ResolvedExpression {
  type: 'static'
  values: string[]
  resolutionType: 'constant' | 'template-resolved' | 'union-resolved' | 'object-property'
}

export interface UnresolvedDynamicExpression {
  type: 'dynamic'
  expression: string
  staticPrefix?: string
  staticSuffix?: string
}

export type StaticEvalResult = ResolvedExpression | UnresolvedDynamicExpression

/**
 * Safely resolves expressions in TypeScript AST without executing any code.
 */
export class StaticValuePropagator {
  /**
   * Attempts to resolve an AST node to one or more statically proven string values.
   */
  static evaluate(
    node: ts.Expression,
    context?: FileScopeContext,
    visited: Set<string> = new Set(),
    depth = 0
  ): StaticEvalResult {
    if (depth > MAX_RESOLUTION_DEPTH) {
      return { type: 'dynamic', expression: node.getText() }
    }

    // 1. String literal / No-substitution template: 'HOME.TITLE'
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const val = node.text.trim()
      return val
        ? { type: 'static', values: [val], resolutionType: 'constant' }
        : { type: 'dynamic', expression: node.getText() }
    }

    // 2. Parenthesized Expression: (expr)
    if (ts.isParenthesizedExpression(node)) {
      return this.evaluate(node.expression, context, visited, depth)
    }

    // 3. As Expression or Type Assertion: (expr as const) or (<string>expr)
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      return this.evaluate(node.expression, context, visited, depth)
    }

    // 4. Identifier: variable name, constant, or alias
    if (ts.isIdentifier(node)) {
      const name = node.text
      if (visited.has(name)) {
        // Cycle detected
        return { type: 'dynamic', expression: node.getText() }
      }

      if (context?.constants) {
        if (context.constants.strings.has(name)) {
          return {
            type: 'static',
            values: [context.constants.strings.get(name)!],
            resolutionType: 'constant',
          }
        }
        if (context.constants.arrays.has(name)) {
          return {
            type: 'static',
            values: context.constants.arrays.get(name)!,
            resolutionType: 'constant',
          }
        }
      }

      return { type: 'dynamic', expression: node.getText() }
    }

    // 5. Property Access: obj.prop or plan.validation.errorKey or p.id
    if (ts.isPropertyAccessExpression(node)) {
      const propName = node.name.text

      // Direct identifier receiver: obj.prop
      if (ts.isIdentifier(node.expression)) {
        const objName = node.expression.text
        if (context?.constants?.objects.has(objName)) {
          const map = context.constants.objects.get(objName)!
          if (map.has(propName)) {
            return {
              type: 'static',
              values: [map.get(propName)!],
              resolutionType: 'object-property',
            }
          }
        }
      }

      // Check known property names registered in context (e.g. errorKey, id, key)
      if (context?.constants?.propertyValues?.has(propName)) {
        const vals = context.constants.propertyValues.get(propName)!
        if (vals.length > 0) {
          return {
            type: 'static',
            values: vals.slice(0, MAX_RESOLVED_VALUES),
            resolutionType: 'union-resolved',
          }
        }
      }

      return { type: 'dynamic', expression: node.getText() }
    }

    // 6. Element Access: obj[key] or obj['key']
    if (ts.isElementAccessExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        const objName = node.expression.text
        if (context?.constants?.objects.has(objName)) {
          const map = context.constants.objects.get(objName)!

          // Literal key access: obj['prop']
          if (node.argumentExpression) {
            const keyRes = this.evaluate(node.argumentExpression, context, visited, depth + 1)
            if (keyRes.type === 'static') {
              const matched: string[] = []
              for (const k of keyRes.values) {
                if (map.has(k)) {
                  matched.push(map.get(k)!)
                }
              }
              if (matched.length > 0) {
                return {
                  type: 'static',
                  values: matched,
                  resolutionType: 'object-property',
                }
              }
            }
          }

          // Finite union / all values of the object
          const allVals = Array.from(new Set(map.values())).filter(Boolean)
          if (allVals.length > 0 && allVals.length <= MAX_RESOLVED_VALUES) {
            return {
              type: 'static',
              values: allVals,
              resolutionType: 'union-resolved',
            }
          }
        }
      }
      return { type: 'dynamic', expression: node.getText() }
    }

    // 7. Conditional (Ternary) Expression: cond ? 'A' : 'B'
    if (ts.isConditionalExpression(node)) {
      const nextVisited = new Set(visited)
      const trueRes = this.evaluate(node.whenTrue, context, nextVisited, depth + 1)
      const falseRes = this.evaluate(node.whenFalse, context, nextVisited, depth + 1)

      if (trueRes.type === 'static' && falseRes.type === 'static') {
        const set = new Set([...trueRes.values, ...falseRes.values])
        return {
          type: 'static',
          values: Array.from(set).slice(0, MAX_RESOLVED_VALUES),
          resolutionType: 'union-resolved',
        }
      }

      return { type: 'dynamic', expression: node.getText() }
    }

    // 8. Binary Expression (+ concatenation): prefix + suffix
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const nextVisited = new Set(visited)
      const leftRes = this.evaluate(node.left, context, nextVisited, depth + 1)
      const rightRes = this.evaluate(node.right, context, nextVisited, depth + 1)

      if (leftRes.type === 'static' && rightRes.type === 'static') {
        const combined: string[] = []
        for (const l of leftRes.values) {
          for (const r of rightRes.values) {
            combined.push(l + r)
            if (combined.length >= MAX_RESOLVED_VALUES) break
          }
          if (combined.length >= MAX_RESOLVED_VALUES) break
        }
        return {
          type: 'static',
          values: combined,
          resolutionType: 'template-resolved',
        }
      }

      // If left is static prefix and right is dynamic: extract prefix
      let staticPrefix: string | undefined
      if (leftRes.type === 'static' && leftRes.values.length === 1) {
        staticPrefix = leftRes.values[0]
      }
      let staticSuffix: string | undefined
      if (rightRes.type === 'static' && rightRes.values.length === 1) {
        staticSuffix = rightRes.values[0]
      }

      return {
        type: 'dynamic',
        expression: node.getText(),
        staticPrefix,
        staticSuffix,
      }
    }

    // 9. Template Literal with Spans: `addKey.${var}` or `providers.${id}.name`
    if (ts.isTemplateExpression(node)) {
      const head = node.head.text
      const spans = node.templateSpans

      let currentCombinations = [head]
      let isFullyStatic = true

      for (const span of spans) {
        const tail = span.literal.text
        const spanRes = this.evaluate(span.expression, context, visited, depth + 1)

        if (spanRes.type === 'static' && spanRes.values.length > 0) {
          const nextCombinations: string[] = []
          for (const prefix of currentCombinations) {
            for (const val of spanRes.values) {
              nextCombinations.push(prefix + val + tail)
              if (nextCombinations.length >= MAX_RESOLVED_VALUES) break
            }
            if (nextCombinations.length >= MAX_RESOLVED_VALUES) break
          }
          currentCombinations = nextCombinations
        } else {
          isFullyStatic = false
          break
        }
      }

      if (isFullyStatic && currentCombinations.length > 0) {
        return {
          type: 'static',
          values: currentCombinations.slice(0, MAX_RESOLVED_VALUES),
          resolutionType: 'template-resolved',
        }
      }

      // If dynamic, extract static head prefix and first span tail suffix if available
      const staticSuffix = spans.length === 1 ? spans[0].literal.text || undefined : undefined
      return {
        type: 'dynamic',
        expression: node.getText(),
        staticPrefix: head || undefined,
        staticSuffix,
      }
    }

    // 10. Array Literal: ['A', 'B']
    if (ts.isArrayLiteralExpression(node)) {
      const allValues: string[] = []
      let allStatic = true

      for (const el of node.elements) {
        const elRes = this.evaluate(el, context, visited, depth + 1)
        if (elRes.type === 'static') {
          allValues.push(...elRes.values)
        } else {
          allStatic = false
        }
      }

      if (allStatic && allValues.length > 0) {
        return {
          type: 'static',
          values: allValues.slice(0, MAX_RESOLVED_VALUES),
          resolutionType: 'constant',
        }
      }
    }

    return { type: 'dynamic', expression: node.getText() }
  }
}
