import React, { useState } from 'react'

const SingleFileUploader = (props: { url: string; onUpload?: () => void }) => {
  const [file, setFile] = useState<File | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0])
      handleUpload(e.target.files[0])
    }
  }

  const handleUpload = async (file: File) => {
    if (file) {
      console.log('Uploading file...')

      const formData = new FormData()
      formData.append('file', file)

      try {
        // You can write the URL of your server or any other endpoint used for file upload
        const resultPromise = await fetch(props.url, {
          method: 'POST',
          body: formData
        })

        const data = await resultPromise
        if (props.onUpload) {
          props.onUpload()
        }

        console.log(data)
      } catch (error) {
        console.error(error)
      }
    }
  }

  return (
    <>
      <div>
        <label htmlFor="file" className="sr-only">
          Datei hinzufügen
        </label>
        <input id="file" type="file" onChange={handleFileChange} />
      </div>
      {/*file && (
        <section>
          File details:
          <ul>
            <li>Name: {file.name}</li>
            <li>Type: {file.type}</li>
            <li>Size: {file.size} bytes</li>
          </ul>
        </section>
      )*/}

      {/*file && <button onClick={handleUpload}>Upload</button>*/}
    </>
  )
}

export default SingleFileUploader
