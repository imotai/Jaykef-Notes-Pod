import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import { useStorage } from '../composable/storage'
import * as db3 from 'db3js'
import dcrypto from "@deliberative/crypto"
import { Buffer as BufferPolyfill } from 'buffer'
globalThis.Buffer = BufferPolyfill;

async function sign(data, privateKey) {
    const signature = await dcrypto.sign(data, privateKey)
    return signature
}

async function generateKey() {
    const mnemonic = await dcrypto.generateMnemonic()
    const keypair = await dcrypto.keyPairFromMnemonic(mnemonic)
    return [keypair.secretKey, keypair.publicKey]
}

const storage = useStorage();
const db3_sdk = new db3.DB3('http://127.0.0.1:26659');
const doc_store = new db3.DocStore(db3_sdk);

async function mySign(data) {
 const [sk, public_key] = await generateKey();
 return [await sign(data, sk), public_key];
}

const noteIndex = {
	keys: [
		{
			name: 'id',
			keyType: db3.DocKeyType.STRING,
		},
	],
	ns: 'my_notes',
	docName: 'notes',
};

export const useNoteStore = defineStore('note', {
  state: () => ({
    data: {},
  }),
  getters: {
    notes: (state) => Object.values(state.data).filter(({ id }) => id),
    getById: (state) => (id) => state.data[id],
  },
  actions: {
    retrieve() {
      return new Promise((resolve) => {
          doc_store.queryDocsByRange(noteIndex, {
                            id: '',
                        },
                          {
                            id: '~',
           }, mySign).then((docs)=> {
                for (doc in docs) {
                    this.data[doc[id]] = doc;
                 }
                resolve(docs);
           });
      });
    },
    add(note = {}) {
      return new Promise((resolve) => {
        const id = note.id || nanoid();
        console.log("add note id" + id);
        const newNote = {
          id,
          title: '',
          content: { type: 'doc', content: [] },
          labels: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isBookmarked: false,
          isArchived: false,
          ...note,
        };
        this.data[id] = newNote;
        const mid = doc_store.insertDocs(noteIndex, [newNote], mySign);
        console.log(mid);
        resolve(mid);
      });
    },
    update(id, data = {}) {
      return new Promise((resolve) => {

        console.log("update note id" + id);
        const updatedNode =  {
          ...this.data[id],
          ...data,
        };
        this.data[id] = updatedNode;
        const mid = doc_store.insertDocs(noteIndex, [updatedNode], mySign);
        console.log(mid);
        resolve(mid);
      });
    },
    async delete(id) {
      try {
        const lastEditedNote = localStorage.getItem('lastNoteEdit');
        if (lastEditedNote === id) localStorage.removeItem('lastNoteEdit');
        const { path, ipcRenderer } = window.electron;
        const dataDir = await storage.get('dataDir', '', 'settings');
        delete this.data[id];
        await ipcRenderer.callMain(
          'fs:remove',
          path.join(dataDir, 'notes-assets', id)
        );
        await storage.delete(`notes.${id}`);
        return id;
      } catch (error) {
        console.error(error);
      }
    },
  },
  addLabel(id, labelId) {
    return new Promise((resolve) => {
      if (this.data[id]) {
        const labelIndex = this.data[id].labels.indexOf(labelId);

        if (labelIndex === -1) {
          this.data[id].labels.push(labelId);

          storage
            .set(`notes.${id}`, this.data[id])
            .then(() => resolve(labelId));

          return;
        }

        resolve();
      }
    });
  },
});
