import React, { useState } from 'react'
import SingleFileUploader from './SingleFileUploader'

export type FileTableProps = {
  edit: boolean
  files: string[]
  downloadURL: string
  uploadURL: string
  onUpload?: () => void
  onDelete?: (fileName: string) => void
}

type FileProps = {
  edit: boolean
  downloadURL: string
  fileName: string
  onDelete?: (fileName: string) => void
}

const FileEntry = (props: FileProps) => {
  return (
    <>
      <tr>
        <td>
          <a
            href={props.downloadURL + '/' + encodeURIComponent(props.fileName)}
          >
            {' '}
            {props.fileName}{' '}
          </a>
        </td>
        {
          /*props.edit && props.onDelete && */
          <td>
            <button
              type="button"
              onClick={() => props.onDelete && props.onDelete(props.fileName)}
            >
              löschen
            </button>
          </td>
        }
      </tr>
    </>
  )
}

export const FileTable = (props: FileTableProps) => {
  const fileNames = [...props.files]

  const fileEntries = fileNames.map(name => (
    <FileEntry
      key={name}
      edit={props.edit}
      downloadURL={props.downloadURL}
      fileName={name}
      onDelete={props.onDelete}
    />
  ))

  return (
    <tbody>
      {fileEntries}

      {props.edit && (
        <tr>
          <td colSpan={2}>
            {/*<form action={props.uploadURL} method="post" encType="multipart/form-data">
                        <input type="file"/>
                        <button>
                            Datei hochladen
                        </button>
            </form>*/}

            <SingleFileUploader
              url={props.uploadURL}
              onUpload={props.onUpload}
            />
          </td>
        </tr>
      )}
    </tbody>
  )
}
