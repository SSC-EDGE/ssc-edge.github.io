/* =========================================================
   SSC EDGE DOWNLOAD SYSTEM
   PDF / E-BOOK DOWNLOAD RECORD ONLY
   ========================================================= */

const SSC_EDGE_DOWNLOAD_META_KEY =
"ssc-edge-downloads-v2";


function getDownloads(){

    try{

        return JSON.parse(
            localStorage.getItem(
                SSC_EDGE_DOWNLOAD_META_KEY
            ) || "[]"
        );

    }catch{

        return [];

    }

}


function saveDownloads(items){

    localStorage.setItem(
        SSC_EDGE_DOWNLOAD_META_KEY,
        JSON.stringify(items)
    );

}


function addDownload(record){

    const items = getDownloads();

    const key =
        record.id ||
        record.url;

    const existingIndex =
        items.findIndex(
            item =>
            (item.id || item.url) === key
        );

    if(existingIndex >= 0){

        items[existingIndex] = {

            ...items[existingIndex],

            ...record,

            updatedAt: Date.now()

        };

    }else{

        items.unshift({

            ...record,

            savedAt: Date.now(),

            updatedAt: Date.now()

        });

    }

    saveDownloads(items);

}


function removeDownload(id){

    const items =
        getDownloads().filter(
            item => item.id !== id
        );

    saveDownloads(items);

}


/* =========================================================
   RECORD PDF / E-BOOK DOWNLOAD
   ========================================================= */

function recordDownload(item){

    if(!item || !item.url){

        return;

    }

    addDownload({

        id:
            item.id ||
            item.url,

        title:
            item.title ||
            "Untitled",

        subject:
            item.subject ||
            "General",

        type:
            item.type === "EBOOK"
            ? "EBOOK"
            : "PDF",

        url:
            item.url

    });

}


/* =========================================================
   PUBLIC API
   ========================================================= */

window.SSCEdgeDownloads = {

    getAll:
        getDownloads,

    recordDownload:
        recordDownload,

    removeDownload:
        removeDownload

};
