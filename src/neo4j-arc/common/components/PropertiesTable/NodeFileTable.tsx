import React, { useReducer } from 'react'
import { useEffect, useState } from 'react'
import { FileTable } from './FileTable'

export type NodeFileTableProps = { nodeId: string }

export const NodeFileTable = (props: NodeFileTableProps) => {
  const [data, setData] = useState([])
  const baseURL = 'http://localhost:8081/files/' + props.nodeId

  const [updateCounter, forceUpdate] = useReducer(x => x + 1, 0)

  useEffect(() => {
    async function getData() {
      const response = await fetch(baseURL)
      const actualData = await response.json()
      setData(actualData)
      console.log(actualData)
    }
    getData()
  }, [props.nodeId, updateCounter])

  const deleteFile = async (fileName: string) => {
    const result = await fetch(baseURL + '/' + fileName, {
      method: 'DELETE'
    })
    forceUpdate()
  }

  return (
    <FileTable
      edit={true}
      files={data as string[]}
      downloadURL={baseURL}
      uploadURL={baseURL + '/'}
      onDelete={deleteFile}
      onUpload={forceUpdate}
    />
  )
}
