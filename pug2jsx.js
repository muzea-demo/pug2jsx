const lex = require('pug-lexer')
const parse = require('pug-parser')
const generator = require('@babel/generator').default
const parseExpression = require("@babel/parser").parseExpression
const t = require('@babel/types')
const prettier = require("prettier/standalone");
const plugins = [require("prettier/parser-babylon")];

const prettierJSConfig = {
  singleQuote: true,
  semi: false,
  parser: "babel",
  plugins,
}

const tagMap = {
  view: 'View',
  text: 'Text',
  icon: 'Icon',
  image: 'Image',
  textarea: 'Textarea',
}

function transformTag(name) {
  return tagMap[name]
}

/**
 * 
 * @param {string} str 
 */
function hasVar (str) {
  return str.indexOf('{{') >= 0
}

/**
 * 
 * @param {PugNode} node  
 */

function findFor(node) {
  return node.attrs.findIndex(attr => attr.name === 'wx:for')
}

/**
 * 
 * @param {PugNode} node  
 */

function findForItem(node) {
  return node.attrs.findIndex(attr => attr.name === 'wx:for-item')
}

/**
 * 
 * @param {PugNode} node  
 */

function findForIndex(node) {
  return node.attrs.findIndex(attr => attr.name === 'wx:for-index')
}

/**
 * 
 * @param {PugNode} node 
 */
function findIf(node) {
  return node.attrs.findIndex(attr => attr.name === 'wx:if')
}

/**
 * 
 * @param {PugNode} node  
 */

function findElse(node) {
  return node.attrs.findIndex(attr => attr.name === 'wx:else')
}

/**
 * 
 * @param {PugNode} node  
 */

function findElif(node) {
  return node.attrs.findIndex(attr => attr.name === 'wx:elif')
}

/**
 * 
 * @param {PugNode} node
 * @param {IterableIterator<PugNode>} iterator
 */
function transformFor(node, iterator) {
  const forIndex = findFor(node)
  if (forIndex >= 0) {
    const forAttr = node.attrs.splice(forIndex, 1)
    const listName = transformAttributeVarName(forAttr[0].val)
    let itemName = 'item'
    const forItemIndex = findForItem(node)
    if (forItemIndex >= 0) {
      itemName = transformVarName(node.attrs.splice(forItemIndex, 1)[0].val)
    }
    let indexName = 'index'
    const forIndexIndex = findForIndex(node)
    if (forIndexIndex >= 0) {
      indexName = transformVarName(node.attrs.splice(forIndexIndex, 1)[0].val)
    }
    return t.jsxExpressionContainer(
      t.callExpression(
        t.memberExpression(
          t.identifier(listName),
          t.identifier('map')
        ),
        [
          t.arrowFunctionExpression(
            [
              t.identifier(itemName),
              t.identifier(indexName),
            ],
            t.blockStatement(
              [
                t.returnStatement(
                  transformNode(node, iterator)
                )
              ]
            )
          )
        ]
      )
    )
  }
  let componentName = transformTag(node.name)
  if (componentName === undefined) {
    componentName = node.name.replace(/^[a-z]/, (match) => match.toUpperCase())
  }
  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier(componentName), transformAttributes(node.attrs)),
    t.jsxClosingElement(t.jsxIdentifier(componentName)),
    transformAST(node.block)
  )
}

/**
 * 
 * @param {string} varName
 */
function transformAttributeVarName(varName) {
  return varName.replace(/^['"]{{/, '').replace(/}}['"]$/, '')
}

/**
 * 
 * @param {string} varName
 */
function transformVarName(varName) {
  return varName.replace(/^['"]/, '').replace(/['"]$/, '')
}

/**
 * 
 * 因为小程序的界面其实是字符串拼接，其实各种语法都是允许的，这里仅对我项目中存在的写法做处理
 * 比如下面这些写法我是不支持的
 * `style="background:#{{itemDetail.bgColor}};"`
 */
function transformStyle(value) {
  return t.jsxExpressionContainer(
    t.objectExpression(
      value.trim().split(';').filter(it => it.length).map(styleItem => {
        const splitIndex = styleItem.indexOf(':')
        const objectKey = styleItem.substr(0, splitIndex).trim()
        const objectValue = styleItem.substr(splitIndex + 1).trim()
        let objectValuePart
        if (hasVar(objectValue)) {
          if (objectValue.startsWith('{{') && objectValue.endsWith('}}')) {
            objectValuePart = parseExpression(objectValue.replace(/^{{/, '').replace(/}}$/, ''))
          } else {
            console.error(objectValue, ' - 这写法没有支持')
            objectValuePart = t.stringLiteral(objectValue)
          }
        } else {
          objectValuePart = t.stringLiteral(objectValue)
        }
        return t.objectProperty(
          t.identifier(objectKey.replace(/-([a-z])/g, (_, p1) => `${p1.toUpperCase()}`)),
          objectValuePart
        )
      })
    )
  )
}

/**
 * 
 * @param {Attr[]} attrs 
 */
function transformAttributes(attrs) {
  return attrs.map(attr => {
    /**
     * 你需要自己处理wx自己的属性
     */
    let name = attr.name
    if (typeof attr.val == 'boolean') {
      return t.jsxAttribute(
        t.jsxIdentifier(name),
        t.jsxExpressionContainer(t.booleanLiteral(attr.val))
      )
    }
    const modifiers = ['.sync', '.user']
    const value = attr.val.replace(/^['"]/g, '').replace(/['"]$/g, '')
    if (name[0] === '@') {
      name = name.replace(/^@([a-z])/, (_, p1) => `on${p1.toUpperCase()}`)
      for (const modifier of modifiers) {
        name = name.replace(modifier, '')
      }
      return t.jsxAttribute(
        t.jsxIdentifier(name),
        t.jsxExpressionContainer(parseExpression(value.replace(/{{(.+?)}}/g, '$1')))
      )
    }
    if (name[0] === ':') {
      name = name.replace(/^:/, '')
      for (const modifier of modifiers) {
        name = name.replace(modifier, '')
      }
      return t.jsxAttribute(
        t.jsxIdentifier(name),
        t.jsxExpressionContainer(t.identifier(value))
      )
    }
    if (name.startsWith('bind')) {
      name = name.replace(/^bind([a-z])/, (_, p1) => `on${p1.toUpperCase()}`)
    }
    let valuePart = t.stringLiteral(value)
    if (name === 'class') {
      name = 'className'
    }
    if (name === 'style') {
      valuePart = transformStyle(value)
    }
    if (name === 'wx:key') {
      name = 'key'
      valuePart = t.jsxExpressionContainer(t.identifier(value))
    }
    name = name.replace(/-([a-z])/g, (_, p1) => p1.toUpperCase())
    return t.jsxAttribute(
      t.jsxIdentifier(name),
      valuePart
    )
  })
}

/**
 * 
 * @param {string} text 
 */
function transformText(text) {
  return text.replace(/{{(.+?)}}/g, '{$1}')
}

/**
 * 
 * @param {PugNode} node
 * @param {IterableIterator<PugNode>} iterator
 */
function transformNode(node, iterator) {
  if (node.type === 'Text') {
    return t.jsxText(transformText(node.val))
  }
  const ifIndex = findIf(node)
  const elifIndex = findElif(node)
  if (ifIndex >= 0 || elifIndex >= 0) {
    let testStr
    if (ifIndex >= 0) {
      testStr = transformAttributeVarName(node.attrs.splice(ifIndex, 1)[0].val)
    }
    if (elifIndex >= 0) {
      testStr = transformAttributeVarName(node.attrs.splice(elifIndex, 1)[0].val)
    }
    let alternate = t.identifier('null')
    if (iterator.nextIsEl()) {
      alternate = transformNode(iterator.next().value, iterator)
    }
    const conditionalExpression = t.conditionalExpression(
      parseExpression(testStr),
      transformNode(node, iterator),
      alternate
    )
    if (elifIndex >= 0) {
      return conditionalExpression
    }
    return t.jsxExpressionContainer(conditionalExpression)
  }
  const elseIndex = findElse(node)
  if (elseIndex >= 0) {
    node.attrs.splice(elseIndex, 1)
  }
  return transformFor(node, iterator)
}

/**
 * 
 * @param {PugBlock} pug 
 */
function transformAST(pug) {
  const length = pug.nodes.length
  let currentIndex = -1;
  const iterator = {
    next() {
      currentIndex += 1;
      if (currentIndex === length) {
        return { done: true }
      }
      return {
        value: pug.nodes[currentIndex],
        done: false,
      }
    },
    nextIsEl() {
      if ((currentIndex + 1) === length) {
        return false
      }
      const node = pug.nodes[currentIndex + 1]
      return findElse(node) >=0 || findElif(node) >= 0
    },
  };
  const ret = []
  while (true) {
    const current = iterator.next()
    if (current.done) {
      break
    }
    const node = current.value
    ret.push(transformNode(node, iterator))
  }
  return ret
}

function pug2jsx(src) {
  const tokens = lex(src)
  const ast = parse(tokens)
  const result = {
    type: 'Program',
    body: transformAST(ast)
  }
  
  const { code } = generator(result, {
    jsescOption: {
      minimal: true
    }
  })
  return prettier.format(code, prettierJSConfig)
}

module.exports = pug2jsx
