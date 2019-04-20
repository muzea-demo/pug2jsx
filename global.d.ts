declare interface PugBlock {
  type: 'Block'
  nodes?: PugNode[]
}

declare interface PugNode {
  type: 'Tag'
  name: string
  block: PugBlock
  attrs: PugAttr[]
}

declare interface PugAttr {
  name: string
  val: string
}


