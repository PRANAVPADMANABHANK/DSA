let arr = ['apple', 'orange']
console.log(arr.length)
arr.unshift("banana")
arr.push("avocado")


for(i=arr.length-1;i>=0;i--){
    console.log(arr[i])
}      


console.log("---------")


for (let arr1 of arr){
    console.log(arr1)
}

console.log("--------")


console.log(arr.sort())