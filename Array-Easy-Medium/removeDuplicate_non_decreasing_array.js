
function removeDuplicate(arr){
 
    let length = arr.length;
    let x = 0;

    for (let i = 0; i<length; i++){
        if(arr[i]>arr[x]){
            x= x+1;
            arr[x]=arr[i]
        }
    }
    return arr;
}

console.log(removeDuplicate([0,0,1,1,1,2,2,3,3,4]))