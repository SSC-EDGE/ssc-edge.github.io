/* =========================================================
   SSC EDGE DOWNLOADS
   PDF / E-BOOK ONLY
========================================================= */

const SSC_EDGE_DOWNLOAD_META_KEY =
    "ssc-edge-downloads-v3";


/* =========================================================
   GET SAVED DOWNLOADS
========================================================= */

function getDownloads(){

    try{

        return JSON.parse(
            localStorage.getItem(
                SSC_EDGE_DOWNLOAD_META_KEY
            ) || "[]"
        );

    }catch(error){

        console.warn(
            "Downloads could not be loaded:",
            error
        );

        return [];

    }

}


/* =========================================================
   SAVE DOWNLOADS
========================================================= */

function saveDownloads(items){

    try{

        localStorage.setItem(
            SSC_EDGE_DOWNLOAD_META_KEY,
            JSON.stringify(items)
        );

    }catch(error){

        console.warn(
            "Downloads could not be saved:",
            error
        );

    }

}


/* =========================================================
   ADD / UPDATE DOWNLOAD
========================================================= */

function addDownload(record){

    if(!record || !record.url){
        return;
    }


    const items =
        getDownloads();


    const key =
        String(
            record.id ||
            record.url
        );


    const existingIndex =
        items.findIndex(
            item =>
                String(
                    item.id ||
                    item.url
                ) === key
        );


    const data = {

        id:
            record.id ||
            record.url,

        title:
            record.title ||
            "Untitled",

        subject:
            record.subject ||
            "General",

        type:
            record.type === "EBOOK"
                ? "EBOOK"
                : "PDF",

        /*
           IMPORTANT:
           Store the ORIGINAL Supabase URL.
           Do NOT change bucket names here.
        */

        url:
            record.url,

        savedAt:
            existingIndex >= 0
                ? items[existingIndex].savedAt
                : Date.now(),

        updatedAt:
            Date.now()

    };


    if(existingIndex >= 0){

        items[existingIndex] =
            {
                ...items[existingIndex],
                ...data
            };

    }else{

        items.unshift(data);

    }


    saveDownloads(items);

}


/* =========================================================
   REMOVE DOWNLOAD
========================================================= */

function removeDownload(id){

    const items =
        getDownloads().filter(
            item =>
                String(item.id) !==
                String(id)
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


    const type =
        item.type === "EBOOK"
            ? "EBOOK"
            : "PDF";


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
            type,

        url:
            item.url

    });

}


/* =========================================================
   CREATE REAL DOWNLOAD URL
=========================================================

   IMPORTANT:

   We detect the bucket from the ORIGINAL URL.

   Example:

   /storage/v1/object/public/ssc-edge-pdfs/file.pdf

   becomes:

   /storage/v1/object/download/ssc-edge-pdfs/file.pdf


   If another bucket is used:

   /storage/v1/object/public/ebooks/file.pdf

   becomes:

   /storage/v1/object/download/ebooks/file.pdf

   No bucket name is hard-coded.
========================================================= */

function getDownloadUrl(originalUrl){

    if(!originalUrl){
        return "";
    }


    let url =
        String(originalUrl);


    /*
       Already a Supabase download URL.
    */

    if(
        url.includes(
            "/storage/v1/object/download/"
        )
    ){

        return url;

    }


    /*
       Supabase public storage URL.
    */

    const marker =
        "/storage/v1/object/public/";


    const index =
        url.indexOf(marker);


    if(index !== -1){

        return (
            url.substring(
                0,
                index
            ) +

            "/storage/v1/object/download/" +

            url.substring(
                index + marker.length
            )
        );

    }


    /*
       If it is not a Supabase public
       storage URL, keep the original URL.
    */

    return url;

}


/* =========================================================
   GLOBAL SSC EDGE DOWNLOAD API
========================================================= */

window.SSCEdgeDownloads = {

    getAll:
        getDownloads,

    recordDownload:
        recordDownload,

    removeDownload:
        removeDownload,

    getDownloadUrl:
        getDownloadUrl

};
