import mimeTypes from 'mime-types'
import { tmpdir } from 'os'
import { http, https } from 'follow-redirects'
import { rename, createWriteStream, existsSync } from 'fs'
import { extname, basename, parse, join } from 'path'
import { IncomingMessage } from 'http'

/**
 * Extraer el mimetype from buffer
 * @param response - La respuesta HTTP
 * @returns Un objeto con el tipo y la extensión del archivo
 */
const fileTypeFromFile = async (response: IncomingMessage): Promise<{ type: string | null; ext: string | false }> => {
    const type = response.headers['content-type'] ?? ''
    const ext = mimeTypes.extension(type)
    return {
        type,
        ext,
    }
}

/**
 * Descargar archivo binario en tmp
 * @param url - La URL del archivo a descargar
 * @returns La ruta al archivo descargado
 */
const generalDownload = async (url: string): Promise<string> => {
    const checkIsLocal = existsSync(url)

    const handleDownload = (): Promise<{ response: IncomingMessage; fullPath: string }> => {
        const checkProtocol = url.startsWith('https:')
        const handleHttp = checkProtocol ? https : http
        const fileName = basename(new URL(url).pathname)
        const name = parse(fileName).name
        const fullPath = join(tmpdir(), name)
        const file = createWriteStream(fullPath)

        if (checkIsLocal) {
            /**
             * From Local
             */
            return new Promise((res) => {
                const response = {
                    headers: {
                        'content-type': mimeTypes.contentType(extname(url)) || '',
                    },
                } as unknown as IncomingMessage
                res({ response, fullPath: url })
            })
        } else {
            /**
             * From URL
             */
            return new Promise((res, rej) => {
                handleHttp.get(url, function (response) {
                    response.pipe(file)
                    file.on('finish', async function () {
                        file.close()
                        res({ response, fullPath })
                    })
                    file.on('error', function () {
                        file.close()
                        rej(new Error('Error downloading file'))
                    })
                })
            })
        }
    }

    const handleFile = (pathInput: string, ext: string | false): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (!ext) {
                reject(new Error('No extension found for the file'))
                return
            }
            const fullPath = checkIsLocal ? `${pathInput}` : `${pathInput}.${ext}`
            rename(pathInput, fullPath, (err) => {
                if (err) reject(err)
                resolve(fullPath)
            })
        })
    }

    const httpResponse = await handleDownload()
    const { ext } = await fileTypeFromFile(httpResponse.response)
    if (!ext) throw new Error('Unable to determine file extension')
    const getPath = await handleFile(httpResponse.fullPath, ext)

    return getPath
}

export { generalDownload }