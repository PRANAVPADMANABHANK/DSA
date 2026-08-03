function removeElements(arr,val){

    let length = arr.length;
    let x = 0 ;

    for (let i = 0 ; i<length; i++){
        if(arr[i]!=val){
            arr[x]= arr[i]
            x= x+1;
        }
    }

    return x;
}

console.log(removeElements([3,2,2,3,4,4],3))