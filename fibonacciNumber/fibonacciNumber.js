// fibonacci number : 0,1,1,2,3,5,8,13,21,...


// const fibonacci=(n)=>{
//     let arr = [0, 1]

    
//     for(i=2;i<=n;i++){
//         arr.push(arr[i-2]+arr[i-1])
//     }

    
//     console.log(arr)

    
// }


// fibonacci(10)

const fibonacci = (n) =>{

    return n<0 ? console.log(0):console.log( fibonacci(n-2)+fibonacci(n-1))
}

fibonacci(5)